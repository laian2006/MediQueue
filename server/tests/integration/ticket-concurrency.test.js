import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// WBS 2.8 (Đức Anh): concurrent issuance and stop, on the shared app with real login.
// Every scenario uses a barrier: the test holds the queue_sessions row lock, fires all
// requests, waits until PostgreSQL reports each of them blocked on that lock, then releases
// it. This guarantees real contention; firing requests one after another is not a race test.
const migrationsDir = fileURLToPath(new URL('../../../database/migrations/', import.meta.url));
const seedsDir = fileURLToPath(new URL('../../../database/seeds/', import.meta.url));
const P1 = '10000000-0000-4000-8000-000000000001'; // shared by rep_a and rep_b (seed)
const EXTRA = 20; // extra patients granted to rep_a for the 20-request scenario

test('WBS 2.8: concurrent ticket issuance and stop on PostgreSQL', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const { default: pg } = await import('pg');
  const { createApp } = await import('../../src/app/app.js');
  const { migrate, seed } = await import('../../src/shared/db/migrations.js');
  const tag = randomUUID().replaceAll('-', '');
  const schema = `mq_ticket_conc_${tag}`;
  const appName = `mq_conc_${tag}`.slice(0, 60); // identifies OUR backends in pg_stat_activity
  assert.match(schema, /^mq_ticket_conc_[a-f0-9]{32}$/);
  const config = { clientOrigin: 'http://localhost:5173', sessionSecret: 'test-only-secret-'.repeat(4),
    cookieSecure: false, noShowTimeoutSeconds: 60, sessionSchema: schema };
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let pool;
  let running;
  let schemaCreated = false;
  t.after(async () => {
    try {
      if (running?.server.listening) await new Promise((resolve) => running.server.close(resolve));
      if (running) await running.app.locals.sessionStore.close();
      if (pool) await pool.end();
      if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await admin.end();
    }
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  // max 24: 20 concurrent requests must all be able to hold a connection while blocked.
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 24,
    application_name: appName, options: `-c search_path=${schema},public` });
  await migrate(pool, migrationsDir);
  await seed(pool, seedsDir);

  const app = createApp({ pool, config });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  running = { app, server };
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;

  const cookies = {};
  async function call(method, path, who, json) {
    const headers = { Origin: config.clientOrigin, Cookie: cookies[who] };
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + path, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) });
    return { status: response.status, body: await response.json() };
  }
  for (const who of ['staff_01', 'rep_a', 'rep_b']) {
    const response = await fetch(`${base}/auth/login`, { method: 'POST',
      headers: { Origin: config.clientOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: who, password: 'Demo@12345' }) });
    assert.equal(response.status, 200, `login ${who}`);
    cookies[who] = response.headers.get('set-cookie').split(';')[0];
  }
  const repA = (await pool.query(`SELECT user_id FROM users WHERE username = 'rep_a'`)).rows[0].user_id;
  // TEST DATA ONLY: 20 extra synthetic patients for rep_a (no real data).
  const extra = [];
  for (let i = 1; i <= EXTRA; i += 1) {
    const { patient_id: id } = (await pool.query(`INSERT INTO patient_profiles (code, display_name)
      VALUES ($1, $2) RETURNING patient_id`, [`C${String(i).padStart(3, '0')}`, `Hồ sơ thử ${i}`])).rows[0];
    await pool.query('INSERT INTO patient_access (user_id, patient_id) VALUES ($1, $2)', [repA, id]);
    extra.push(id);
  }

  const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
  const snapshot = (sessionId) => one(`SELECT
      (SELECT count(*)::int FROM tickets WHERE session_id = $1) AS tickets,
      (SELECT count(*)::int FROM ticket_events e JOIN tickets t USING (ticket_id)
        WHERE t.session_id = $1 AND e.action = 'ISSUED') AS issued_events,
      (SELECT last_issued_number FROM queue_sessions WHERE session_id = $1) AS counter`, [sessionId]);
  const openSession = async () => {
    const res = await call('POST', '/sessions', 'staff_01', {});
    assert.equal(res.status, 201);
    return res.body.data.sessionId;
  };
  const closeSession = async (sessionId) => {
    await pool.query(`UPDATE tickets SET status = 'CANCELLED', updated_at = statement_timestamp()
      WHERE session_id = $1 AND status IN ('WAITING','CALLED','REGISTERING')`, [sessionId]); // test data only
    if ((await call('POST', `/sessions/${sessionId}/stop`, 'staff_01')).status !== 200) throw new Error('stop failed');
    assert.equal((await call('POST', `/sessions/${sessionId}/close`, 'staff_01')).status, 200);
  };

  // Barrier: hold the session row lock, start the requests group by group, and after each group
  // wait until PostgreSQL reports that many of OUR backends blocked on a lock; then release so
  // they compete at the same instant. Group order fixes the order in which they queue.
  // `blocked` lets a group declare how many of its requests are EXPECTED to wait (retries don't).
  async function race(sessionId, groups) {
    const holder = await admin.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT 1 FROM "${schema}".queue_sessions WHERE session_id = $1 FOR UPDATE`, [sessionId]);
      const pending = [];
      let expected = 0;
      for (const group of groups) {
        const starters = Array.isArray(group) ? group : group.starters;
        expected += Array.isArray(group) ? starters.length : group.blocked;
        pending.push(...starters.map((start) => start()));
        const deadline = Date.now() + 10_000;
        for (;;) {
          const { n } = (await admin.query(`SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE application_name = $1 AND wait_event_type = 'Lock'`, [appName])).rows[0];
          if (n >= expected) break;
          if (Date.now() > deadline) throw new Error(`only ${n}/${expected} requests reached the lock`);
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
      await holder.query('COMMIT');
      return await Promise.all(pending);
    } catch (error) {
      await holder.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      holder.release();
    }
  }
  const issueBody = (sessionId, patientId, requestId = randomUUID()) => ({ patientId, sessionId, requestId });
  const issue = (who, body) => () => call('POST', '/tickets', who, body);

  await t.test('C-01 twenty patients at the same instant → 20 tickets numbered 1..20, 20 ISSUED events, counter 20', async () => {
    const sessionId = await openSession();
    const results = await race(sessionId, [extra.map((patientId) => issue('rep_a', issueBody(sessionId, patientId)))]);
    assert.deepEqual(results.map((r) => r.status), Array(EXTRA).fill(201));
    const numbers = results.map((r) => r.body.data.ticket.number).sort((a, b) => a - b);
    assert.deepEqual(numbers, Array.from({ length: EXTRA }, (_, i) => i + 1), 'unique, no gap, none lost');
    assert.deepEqual(await snapshot(sessionId), { tickets: EXTRA, issued_events: EXTRA, counter: EXTRA });
    const perTicket = await pool.query(`SELECT t.number, count(e.event_id)::int AS events FROM tickets t
      LEFT JOIN ticket_events e ON e.ticket_id = t.ticket_id AND e.action = 'ISSUED'
      WHERE t.session_id = $1 GROUP BY t.number`, [sessionId]);
    assert.ok(perTicket.rows.every((r) => r.events === 1), 'every ticket has exactly one ISSUED event');
    const waiting = results.map((r) => r.body.data).sort((a, b) => a.ticket.number - b.ticket.number);
    assert.deepEqual(waiting.map((v) => v.waitingAhead), Array.from({ length: EXTRA }, (_, i) => i));
    // The session row must not move back in time when blocked transactions commit late.
    const clock = await one(`SELECT s.updated_at >= max(t.created_at) AS monotonic FROM queue_sessions s
      JOIN tickets t ON t.session_id = s.session_id WHERE s.session_id = $1 GROUP BY s.updated_at`, [sessionId]);
    assert.equal(clock.monotonic, true, 'queue_sessions.updated_at went backwards');
    await closeSession(sessionId);
  });

  await t.test('C-02 two representatives, same patient, same instant (5 rounds) → always one active ticket, the other 409', async () => {
    const sessionId = await openSession();
    for (let round = 1; round <= 5; round += 1) {
      const results = await race(sessionId, [[issue('rep_a', issueBody(sessionId, P1)), issue('rep_b', issueBody(sessionId, P1))]]);
      const statuses = results.map((r) => r.status).sort();
      assert.deepEqual(statuses, [201, 409], `round ${round}`);
      const winner = results.find((r) => r.status === 201).body.data.ticket;
      const loser = results.find((r) => r.status === 409).body.error;
      assert.equal(loser.code, 'ACTIVE_TICKET_EXISTS');
      assert.deepEqual(loser.details, { ticketId: winner.ticketId });
      const active = await one(`SELECT count(*)::int AS n FROM tickets WHERE session_id = $1 AND patient_id = $2
        AND status IN ('WAITING','CALLED','REGISTERING')`, [sessionId, P1]);
      assert.equal(active.n, 1);
      await pool.query(`UPDATE tickets SET status = 'CANCELLED', updated_at = statement_timestamp() WHERE ticket_id = $1`,
        [winner.ticketId]); // test data: free the patient for the next round
    }
    assert.deepEqual(await snapshot(sessionId), { tickets: 5, issued_events: 5, counter: 5 });
    await closeSession(sessionId);
  });

  async function stopRace(stopQueuesFirst) {
    const sessionId = await openSession();
    const issues = extra.slice(0, 10).map((patientId) => issue('rep_a', issueBody(sessionId, patientId)));
    const stop = () => call('POST', `/sessions/${sessionId}/stop`, 'staff_01');
    const groups = stopQueuesFirst ? [[stop], issues] : [issues, [stop]];
    const results = await race(sessionId, groups);
    const stopResult = stopQueuesFirst ? results.shift() : results.pop();
    assert.equal(stopResult.status, 200);
    assert.equal(stopResult.body.data.status, 'STOPPED');
    for (const r of results) {
      assert.ok(r.status === 201 || (r.status === 409 && r.body.error.code === 'INVALID_STATE'), JSON.stringify(r));
    }
    const created = results.filter((r) => r.status === 201).length;
    assert.deepEqual(await snapshot(sessionId), { tickets: created, issued_events: created, counter: created },
      'tickets, ISSUED events and the counter agree; rejected requests left nothing behind');
    const order = await one(`SELECT max(e.occurred_at) < s.stopped_at OR max(e.occurred_at) IS NULL AS before_stop
      FROM queue_sessions s LEFT JOIN tickets t ON t.session_id = s.session_id
      LEFT JOIN ticket_events e ON e.ticket_id = t.ticket_id AND e.action = 'ISSUED'
      WHERE s.session_id = $1 GROUP BY s.stopped_at`, [sessionId]);
    assert.equal(order.before_stop, true, 'a ticket was issued after the stop was recorded');
    const late = await call('POST', '/tickets', 'rep_a', issueBody(sessionId, extra[15]));
    assert.equal(late.status, 409);
    assert.equal(late.body.error.code, 'INVALID_STATE');
    await closeSession(sessionId);
    return created;
  }

  await t.test('C-03a stop queued BEFORE ten issues → stop wins the lock, no ticket issued, all ten 409 INVALID_STATE', async () => {
    const created = await stopRace(true);
    t.diagnostic(`C-03a: ${created}/10 issued`);
    assert.equal(created, 0);
  });

  await t.test('C-03b ten issues queued BEFORE stop → they are served first, then stop; every ISSUED precedes stopped_at', async () => {
    const created = await stopRace(false);
    t.diagnostic(`C-03b: ${created}/10 issued before the stop`);
    assert.ok(created >= 1, 'issues queued ahead of the stop must be able to complete');
  });

  await t.test('C-04 after STOPPED is committed, ten simultaneous requests issue nothing', async () => {
    const sessionId = await openSession();
    assert.equal((await call('POST', `/sessions/${sessionId}/stop`, 'staff_01')).status, 200);
    const results = await race(sessionId, [extra.slice(0, 10).map((patientId) => issue('rep_a', issueBody(sessionId, patientId)))]);
    assert.ok(results.every((r) => r.status === 409 && r.body.error.code === 'INVALID_STATE'));
    assert.deepEqual(await snapshot(sessionId), { tickets: 0, issued_events: 0, counter: 0 });
    assert.equal((await call('POST', `/sessions/${sessionId}/close`, 'staff_01')).status, 200);
  });

  await t.test('C-05 retries and stop together: same-key retries all get the stored ticket, a new key is refused after stop', async () => {
    const sessionId = await openSession();
    const body = issueBody(sessionId, extra[0]);
    const first = await call('POST', '/tickets', 'rep_a', body);
    assert.equal(first.status, 201);
    const results = await race(sessionId, [
      [() => call('POST', `/sessions/${sessionId}/stop`, 'staff_01')],
      { starters: [issue('rep_a', body), issue('rep_a', body), issue('rep_a', body)], blocked: 0 },
    ]);
    // Retries are answered before the OPEN check (2.7), so they never block on the session lock.
    const retries = results.slice(1);
    for (const r of retries) {
      assert.equal(r.status, 200);
      assert.equal(r.body.data.ticket.ticketId, first.body.data.ticket.ticketId);
    }
    assert.equal(results[0].status, 200); // stop
    const fresh = await call('POST', '/tickets', 'rep_a', issueBody(sessionId, extra[1]));
    assert.equal(fresh.status, 409);
    assert.equal(fresh.body.error.code, 'INVALID_STATE');
    assert.deepEqual(await snapshot(sessionId), { tickets: 1, issued_events: 1, counter: 1 });
    await closeSession(sessionId);
  });

  await t.test('C-06 failed issue transaction leaves no ticket, counter or requestId behind; the same key succeeds later', async () => {
    const sessionId = await openSession();
    const body = issueBody(sessionId, extra[2]);
    await pool.query('ALTER TABLE ticket_events RENAME TO ticket_events_hidden_for_test');
    let failed;
    try {
      failed = await call('POST', '/tickets', 'rep_a', body);
    } finally {
      await pool.query('ALTER TABLE ticket_events_hidden_for_test RENAME TO ticket_events');
    }
    assert.equal(failed.status, 500);
    assert.equal(failed.body.error.code, 'INTERNAL_ERROR');
    assert.deepEqual(await snapshot(sessionId), { tickets: 0, issued_events: 0, counter: 0 });
    const again = await call('POST', '/tickets', 'rep_a', body);
    assert.equal(again.status, 201, 'the requestId was not burned by the rolled-back attempt');
    assert.equal(again.body.data.ticket.number, 1, 'the rolled-back attempt did not consume a number');
    await closeSession(sessionId);
  });
});
