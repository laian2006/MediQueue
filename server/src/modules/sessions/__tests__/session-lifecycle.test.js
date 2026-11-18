import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createApp } from '../../../app/app.js';
import { migrate, seed } from '../../../shared/db/migrations.js';

const migrations = fileURLToPath(new URL('../../../../../database/migrations/', import.meta.url));
const seeds = fileURLToPath(new URL('../../../../../database/seeds/', import.meta.url));
const patientId = '10000000-0000-4000-8000-000000000001';
const staffId = '00000000-0000-4000-8000-000000000001';

test('2.1: session lifecycle with real authentication, locking and PostgreSQL', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const { default: pg } = await import('pg');
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const schema = `mq_lifecycle_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${schema},public`, max: 12 });
  let app;
  let server;
  t.after(async () => {
    try {
      if (server) await new Promise(resolve => server.close(resolve));
      await app?.locals.sessionStore.close();
      await pool.end();
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally { await admin.end(); }
  });
  await migrate(pool, migrations);
  await seed(pool, seeds);
  const origin = 'http://localhost:5173';
  app = createApp({ pool, config: { clientOrigin: origin, sessionSchema: schema,
    sessionSecret: 'session-lifecycle-test-only-secret', cookieSecure: false, noShowTimeoutSeconds: 60 } });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const cookies = {};
  for (const username of ['staff_01', 'rep_a']) {
    const response = await fetch(`${base}/auth/login`, { method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: 'Demo@12345' }) });
    assert.equal(response.status, 200);
    cookies[username] = response.headers.get('set-cookie').split(';')[0];
  }
  async function call(method, path, who = 'staff_01', json) {
    const headers = { Origin: origin };
    if (who) headers.Cookie = cookies[who];
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + path, { method, headers,
      ...(json === undefined ? {} : { body: JSON.stringify(json) }) });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  const open = async () => {
    const response = await call('POST', '/sessions');
    assert.equal(response.status, 201);
    return response.body.data.sessionId;
  };
  const change = (id, action) => call('POST', `/sessions/${id}/${action}`);
  const row = async id => (await pool.query('SELECT * FROM queue_sessions WHERE session_id = $1', [id])).rows[0];
  const issue = (id, requestId = randomUUID()) => call('POST', '/tickets', 'rep_a', { sessionId: id, patientId, requestId });
  const cancel = ticket => call('POST', `/tickets/${ticket.ticketId}/cancel`, 'rep_a');
  const code = (response, status, expected) => {
    assert.equal(response.status, status);
    assert.equal(response.body.error.code, expected);
    assert.equal(response.body.data, undefined);
  };

  await t.test('authentication, role, UUID and empty-body checks reject without writes', async () => {
    const id = await open();
    const before = await row(id);
    for (const action of ['stop', 'close']) {
      code(await call('POST', `/sessions/${id}/${action}`, null), 401, 'UNAUTHENTICATED');
      code(await call('POST', `/sessions/${id}/${action}`, 'rep_a'), 403, 'FORBIDDEN');
      code(await change('bad-id', action), 400, 'VALIDATION_ERROR');
      code(await change(randomUUID(), action), 404, 'NOT_FOUND');
      for (const body of [null, [], { userId: staffId }]) {
        code(await call('POST', `/sessions/${id}/${action}`, 'staff_01', body), 400, 'VALIDATION_ERROR');
      }
    }
    assert.deepEqual(await row(id), before);
    code(await change(id, 'close'), 409, 'INVALID_STATE');
    await change(id, 'stop');
    await change(id, 'close');
  });

  await t.test('stop/close retries preserve timestamps, actors, history and the six-field DTO', async () => {
    const id = await open();
    const stopped = await change(id.toUpperCase(), 'stop');
    assert.equal(stopped.status, 200);
    assert.equal(stopped.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Object.keys(stopped.body.data).sort(), ['closedAt', 'lastIssuedNumber', 'openedAt', 'sessionId', 'status', 'stoppedAt']);
    const before = await row(id);
    assert.equal(before.stopped_by, staffId);
    assert.ok(before.stopped_at >= before.opened_at);
    assert.deepEqual((await change(id, 'stop')).body, stopped.body);
    assert.deepEqual(await row(id), before);
    code(await call('POST', '/sessions'), 409, 'SESSION_ALREADY_ACTIVE');
    const closed = await change(id, 'close');
    assert.equal(closed.status, 200);
    const after = await row(id);
    assert.equal(after.closed_by, staffId);
    assert.ok(after.closed_at >= after.stopped_at);
    assert.deepEqual((await change(id, 'close')).body, closed.body);
    assert.deepEqual(await row(id), after);
    code(await change(id, 'stop'), 409, 'INVALID_STATE');
    assert.equal((await call('GET', '/sessions/current')).body.data, null);
    const next = await open();
    assert.notEqual(next, id);
    assert.equal((await row(next)).last_issued_number, 0);
    assert.equal((await row(id)).status, 'CLOSED');
    await change(next, 'stop');
    await change(next, 'close');
  });

  await t.test('STOPPED rejects new issuance, replays old keys and permits cancellation', async () => {
    const id = await open();
    const requestId = randomUUID();
    const created = await issue(id, requestId);
    assert.equal(created.status, 201);
    assert.equal((await change(id, 'stop')).status, 200);
    code(await issue(id), 409, 'INVALID_STATE');
    const replay = await issue(id, requestId);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.data.ticket.ticketId, created.body.data.ticket.ticketId);
    code(await change(id, 'close'), 409, 'ACTIVE_TICKETS_REMAIN');
    assert.equal((await cancel(created.body.data.ticket)).status, 200);
    assert.equal((await change(id, 'close')).status, 200);
    assert.equal((await issue(id, requestId)).body.data.ticket.status, 'CANCELLED');
  });

  await t.test('WAITING, CALLED and REGISTERING each prevent close; calling still works after stop', async () => {
    const id = await open();
    const created = await issue(id);
    await change(id, 'stop');
    code(await change(id, 'close'), 409, 'ACTIVE_TICKETS_REMAIN');
    assert.equal((await call('POST', '/queue/call-next', 'staff_01', { sessionId: id })).status, 200);
    code(await change(id, 'close'), 409, 'ACTIVE_TICKETS_REMAIN');
    // Fixture only: real start/complete endpoints are owned by task 2.10.
    await pool.query("UPDATE tickets SET status = 'REGISTERING' WHERE ticket_id = $1", [created.body.data.ticket.ticketId]);
    code(await change(id, 'close'), 409, 'ACTIVE_TICKETS_REMAIN');
    assert.equal((await row(id)).closed_at, null);
    await pool.query("UPDATE tickets SET status = 'COMPLETED' WHERE ticket_id = $1", [created.body.data.ticket.ticketId]);
    assert.equal((await change(id, 'close')).status, 200);
    assert.equal(Number((await pool.query('SELECT count(*) FROM ticket_events WHERE ticket_id = $1', [created.body.data.ticket.ticketId])).rows[0].count), 2);
  });

  await t.test('four stop/issue races keep a coherent counter and no issuance after STOPPED', async () => {
    for (let round = 0; round < 4; round += 1) {
      const id = await open();
      const [stopped, created] = await Promise.all([change(id, 'stop'), issue(id)]);
      assert.equal(stopped.status, 200);
      assert.ok([201, 409].includes(created.status));
      assert.equal((await row(id)).status, 'STOPPED');
      if (created.status === 201) {
        assert.equal((await row(id)).last_issued_number, 1);
        code(await change(id, 'close'), 409, 'ACTIVE_TICKETS_REMAIN');
        assert.equal((await cancel(created.body.data.ticket)).status, 200);
      } else {
        code(created, 409, 'INVALID_STATE');
        assert.equal((await row(id)).last_issued_number, 0);
      }
      code(await issue(id), 409, 'INVALID_STATE');
      assert.equal((await change(id, 'close')).status, 200);
    }
  });

  await t.test('close/cancel race drains safely; concurrent close is repeatable', async () => {
    const id = await open();
    const created = await issue(id);
    await change(id, 'stop');
    const [closed, cancelled] = await Promise.all([change(id, 'close'), cancel(created.body.data.ticket)]);
    assert.ok([200, 409].includes(closed.status));
    if (closed.status === 409) code(closed, 409, 'ACTIVE_TICKETS_REMAIN');
    assert.equal(cancelled.status, 200);
    const results = await Promise.all([change(id, 'close'), change(id, 'close')]);
    assert.ok(results.every(result => result.status === 200));
    assert.deepEqual(results[0].body, results[1].body);
    assert.equal((await row(id)).status, 'CLOSED');
    assert.equal((await call('GET', '/sessions/current')).body.data, null);
  });
});
