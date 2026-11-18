import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const migrationsDir = fileURLToPath(new URL('../../../database/migrations/', import.meta.url));
const seedsDir = fileURLToPath(new URL('../../../database/seeds/', import.meta.url));
const IDS = {
  p1: '10000000-0000-4000-8000-000000000001', // rep_a + rep_b
  p2: '10000000-0000-4000-8000-000000000002', // rep_a only
  p3: '10000000-0000-4000-8000-000000000003', // rep_b only
};
const TICKET_KEYS = ['createdAt', 'lastCalledAt', 'number', 'patientId', 'sessionId', 'status', 'ticketId', 'updatedAt'];

test('WBS 1.8: router refuses to start without shared authentication or services', async () => {
  const { createTicketRouter } = await import('../../src/modules/tickets/ticket.routes.js');
  const issueService = { issueWithStatus: async () => {} };
  const queryService = { getById: async () => {}, getActive: async () => {} };
  const cancelService = { cancel: async () => {} };
  assert.throws(() => createTicketRouter({ issueService, queryService, cancelService }), TypeError);
  assert.throws(() => createTicketRouter({ queryService, cancelService, authenticate: () => {} }), TypeError);
  assert.throws(() => createTicketRouter({ issueService, cancelService, authenticate: () => {} }), TypeError);
  assert.throws(() => createTicketRouter({ issueService, queryService, authenticate: () => {} }), TypeError);
});

// Full shared app (1.19) with real cookie login (1.4), sessions (1.1), transaction and TicketEvent.
// No database URL means an explicit skip, never a claimed integration pass.
test('WBS 1.8: ticket API on the shared app with real login and PostgreSQL', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const { default: pg } = await import('pg');
  const { createApp } = await import('../../src/app/app.js');
  const { migrate, seed } = await import('../../src/shared/db/migrations.js');
  const schema = `mq_tickets_api_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^mq_tickets_api_[a-f0-9]{32}$/);
  const config = { clientOrigin: 'http://localhost:5173', sessionSecret: 'test-only-secret-'.repeat(4),
    cookieSecure: false, noShowTimeoutSeconds: 60, sessionSchema: schema };
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let pool;
  let running;
  let schemaCreated = false;
  async function stop() {
    if (!running) return;
    if (running.server.listening) await new Promise((resolve) => running.server.close(resolve));
    await running.app.locals.sessionStore.close();
    running = undefined;
  }
  t.after(async () => {
    try {
      await stop();
      if (pool) await pool.end();
      if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await admin.end();
    }
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
  await migrate(pool, migrationsDir);
  await seed(pool, seedsDir);

  let base;
  async function start() {
    await stop();
    const app = createApp({ pool, config });
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    running = { app, server };
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
  }
  const cookies = {};
  async function call(method, path, who, { json, raw, contentType } = {}) {
    const headers = { Origin: config.clientOrigin };
    if (who) headers.Cookie = cookies[who];
    let body;
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (raw !== undefined) { headers['Content-Type'] = contentType; body = raw; }
    const response = await fetch(base + path, { method, headers, body });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  async function login(who) {
    const response = await fetch(`${base}/auth/login`, { method: 'POST',
      headers: { Origin: config.clientOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: who, password: 'Demo@12345' }) });
    assert.equal(response.status, 200, `login ${who}`);
    cookies[who] = response.headers.get('set-cookie').split(';')[0];
  }
  const issue = (who, sessionId, patientId, requestId = randomUUID()) =>
    call('POST', '/tickets', who, { json: { patientId, sessionId, requestId } });
  const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
  const counts = async () => one(`SELECT (SELECT count(*)::int FROM tickets) AS tickets,
    (SELECT count(*)::int FROM ticket_events) AS events`);
  const setStatus = (ticketId, status, called = false) => pool.query(`UPDATE tickets SET status = $2,
    last_called_at = CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE last_called_at END, updated_at = CURRENT_TIMESTAMP
    WHERE ticket_id = $1`, [ticketId, status, called]); // test data only; real transitions are 1.10/1.11/2.13

  await start();
  for (const who of ['staff_01', 'rep_a', 'rep_b']) await login(who);
  const opened = await call('POST', '/sessions', 'staff_01', { json: {} }); // An's real API (1.1)
  assert.equal(opened.status, 201);
  const sessionId = opened.body.data.sessionId;
  const active = (patientId, who, sid = sessionId) => call('GET', `/tickets/active?patientId=${patientId}&sessionId=${sid}`, who);
  const tickets = {};

  await t.test('API-01 POST → 201 {data:{ticket, waitingAhead}}, ISSUED event by the logged-in user', async () => {
    const res = await issue('rep_a', sessionId, IDS.p2);
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Object.keys(res.body), ['data']);
    assert.deepEqual(Object.keys(res.body.data).sort(), ['ticket', 'waitingAhead']);
    assert.deepEqual(Object.keys(res.body.data.ticket).sort(), TICKET_KEYS);
    assert.equal(res.body.data.ticket.status, 'WAITING');
    assert.equal(res.body.data.ticket.number, 1);
    assert.equal(res.body.data.waitingAhead, 0);
    tickets.p2 = res.body.data.ticket;
    const event = await one(`SELECT e.action, e.from_status, e.to_status, u.username FROM ticket_events e
      JOIN users u ON u.user_id = e.actor_user_id WHERE e.ticket_id = $1`, [tickets.p2.ticketId]);
    assert.deepEqual(event, { action: 'ISSUED', from_status: null, to_status: 'WAITING', username: 'rep_a' });
    assert.equal((await call('GET', '/sessions/current', 'rep_a')).body.data.lastIssuedNumber, 1);
  });

  await t.test('API-02 second patient → #2 with one WAITING ahead', async () => {
    const res = await issue('rep_a', sessionId, IDS.p1);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.ticket.number, 2);
    assert.equal(res.body.data.waitingAhead, 1);
    tickets.p1 = res.body.data.ticket;
  });

  await t.test('API-03 GET /:id by another representative of the same patient → 200', async () => {
    const res = await call('GET', `/tickets/${tickets.p1.ticketId}`, 'rep_b');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.ticket, tickets.p1);
    assert.equal(res.body.data.waitingAhead, 1);
  });

  await t.test('API-04 GET /:id without PatientAccess → 403 and no ticket field in the body', async () => {
    const res = await call('GET', `/tickets/${tickets.p2.ticketId}`, 'rep_b');
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
    assert.equal('data' in res.body, false);
    assert.equal(JSON.stringify(res.body).includes(tickets.p2.ticketId), false);
    assert.equal(JSON.stringify(res.body).includes(IDS.p2), false);
  });

  await t.test('API-05 GET /:id unknown → 404; malformed → 400; STAFF → 403; no cookie → 401', async () => {
    assert.equal((await call('GET', `/tickets/${randomUUID()}`, 'rep_a')).status, 404);
    assert.equal((await call('GET', '/tickets/not-a-uuid', 'rep_a')).body.error.code, 'VALIDATION_ERROR');
    assert.equal((await call('GET', `/tickets/${tickets.p1.ticketId}`, 'staff_01')).status, 403);
    assert.equal((await call('GET', `/tickets/${tickets.p1.ticketId}`)).status, 401);
  });

  await t.test('API-06 GET /active: found, null, 403 outside access, 400 bad query, 403 STAFF', async () => {
    const found = await active(IDS.p1, 'rep_b');
    assert.equal(found.status, 200);
    assert.equal(found.body.data.ticket.ticketId, tickets.p1.ticketId);
    assert.deepEqual((await active(IDS.p3, 'rep_b')).body, { data: null });
    assert.equal((await active(IDS.p3, 'rep_a')).status, 403);
    assert.equal((await call('GET', `/tickets/active?patientId=${IDS.p1}`, 'rep_a')).status, 400);
    assert.equal((await call('GET', `/tickets/active?patientId=${IDS.p1}&sessionId=${sessionId}&x=1`, 'rep_a')).status, 400);
    assert.equal((await call('GET', `/tickets/active?patientId=${IDS.p1}&patientId=${IDS.p1}&sessionId=${sessionId}`, 'rep_a')).status, 400);
    assert.equal((await active(IDS.p1, 'staff_01')).status, 403);
  });

  await t.test('API-07 second representative, same patient → 409 ACTIVE_TICKET_EXISTS with details.ticketId', async () => {
    const before = await counts();
    const res = await issue('rep_b', sessionId, IDS.p1);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'ACTIVE_TICKET_EXISTS');
    assert.deepEqual(res.body.error.details, { ticketId: tickets.p1.ticketId });
    assert.deepEqual(await counts(), before);
  });

  await t.test('API-08 waitingAhead skips CANCELLED and CALLED; CALLED ticket shows null', async () => {
    const third = await issue('rep_b', sessionId, IDS.p3);
    assert.equal(third.body.data.ticket.number, 3);
    assert.equal(third.body.data.waitingAhead, 2);
    tickets.p3 = third.body.data.ticket;
    await setStatus(tickets.p2.ticketId, 'CANCELLED');
    assert.equal((await call('GET', `/tickets/${tickets.p3.ticketId}`, 'rep_b')).body.data.waitingAhead, 1);
    await setStatus(tickets.p1.ticketId, 'CALLED', true);
    assert.equal((await call('GET', `/tickets/${tickets.p3.ticketId}`, 'rep_b')).body.data.waitingAhead, 0);
    const called = await call('GET', `/tickets/${tickets.p1.ticketId}`, 'rep_a');
    assert.equal(called.body.data.ticket.status, 'CALLED');
    assert.equal(called.body.data.waitingAhead, null);
    assert.notEqual(called.body.data.ticket.lastCalledAt, null);
    assert.equal((await active(IDS.p1, 'rep_b')).body.data.ticket.status, 'CALLED');
  });

  await t.test('API-09 ended tickets stay readable by id but are not "active"', async () => {
    const res = await call('GET', `/tickets/${tickets.p2.ticketId}`, 'rep_a');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.ticket.status, 'CANCELLED');
    assert.equal(res.body.data.waitingAhead, null);
    assert.deepEqual((await active(IDS.p2, 'rep_a')).body, { data: null });
  });

  await t.test('API-10 POST rejections write nothing and carry no-store', async () => {
    const before = await counts();
    const body = { patientId: IDS.p2, sessionId, requestId: randomUUID() };
    const cases = [
      [await call('POST', '/tickets', undefined, { json: body }), 401, 'UNAUTHENTICATED'],
      [await call('POST', '/tickets', 'staff_01', { json: body }), 403, 'FORBIDDEN'],
      [await issue('rep_a', sessionId, IDS.p3), 403, 'FORBIDDEN'],
      [await call('POST', '/tickets', 'rep_a', { raw: JSON.stringify(body), contentType: 'text/plain' }), 400, 'VALIDATION_ERROR'],
      [await call('POST', '/tickets', 'rep_a', { raw: '{"patientId":', contentType: 'application/json' }), 400, 'VALIDATION_ERROR'],
      [await call('POST', '/tickets', 'rep_a', { json: [body] }), 400, 'VALIDATION_ERROR'],
      [await call('POST', '/tickets', 'rep_a', { json: { ...body, number: 1 } }), 400, 'VALIDATION_ERROR'],
      [await call('POST', '/tickets', 'rep_a'), 400, 'VALIDATION_ERROR'],
      [await issue('rep_a', randomUUID(), IDS.p2), 404, 'NOT_FOUND'],
    ];
    for (const [res, status, code] of cases) {
      assert.equal(res.status, status, code);
      assert.equal(res.body.error.code, code);
      assert.equal(res.headers.get('cache-control'), 'no-store');
    }
    assert.deepEqual(await counts(), before);
  });

  await t.test('API-11 hostile Origin is refused before the ticket module runs', async () => {
    const before = await counts();
    const response = await fetch(`${base}/tickets`, { method: 'POST',
      headers: { Origin: 'https://evil.example', Cookie: cookies.rep_a, 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId: IDS.p2, sessionId, requestId: randomUUID() }) });
    assert.equal(response.status, 403);
    assert.deepEqual(await counts(), before);
  });

  await t.test('API-12 STOPPED session → 409 INVALID_STATE; existing tickets stay readable', async () => {
    await pool.query(`UPDATE queue_sessions SET status = 'STOPPED', stopped_by = opened_by, stopped_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE session_id = $1`, [sessionId]); // test data; real stop is WBS 2.1
    const res = await issue('rep_a', sessionId, IDS.p2);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INVALID_STATE');
    assert.equal((await call('GET', `/tickets/${tickets.p3.ticketId}`, 'rep_b')).body.data.waitingAhead, 0);
  });

  await t.test('API-13 restarting the API keeps tickets, events and the login session', async () => {
    const before = await counts();
    await start();
    const res = await call('GET', `/tickets/${tickets.p3.ticketId}`, 'rep_b');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.ticket.number, 3);
    assert.deepEqual(await counts(), before);
  });

  await t.test('API-15 sprint 1 flow: choose an allowed patient from /patients, issue, reload finds the same ticket', async () => {
    const fresh = await call('POST', '/sessions', 'staff_01', { json: {} }); // previous session is STOPPED
    assert.equal(fresh.status, 409); // only one active session at a time (An, 1.1)
    await pool.query(`UPDATE queue_sessions SET status = 'CLOSED', closed_by = opened_by, closed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE session_id = $1`, [sessionId]); // test data; real close is WBS 2.1
    await pool.query(`UPDATE tickets SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP
      WHERE session_id = $1 AND status IN ('WAITING','CALLED','REGISTERING')`, [sessionId]);
    const reopened = await call('POST', '/sessions', 'staff_01', { json: {} });
    assert.equal(reopened.status, 201);
    const newSession = reopened.body.data.sessionId;

    const patients = await call('GET', '/patients', 'rep_b'); // Hưng's real API (1.5)
    assert.equal(patients.status, 200);
    const allowed = patients.body.data.map((p) => p.patientId).sort();
    assert.deepEqual(allowed, [IDS.p1, IDS.p3].sort());
    const chosen = patients.body.data.find((p) => p.patientId === IDS.p3);
    const requestId = randomUUID();
    const created = await call('POST', '/tickets', 'rep_b', { json: { patientId: chosen.patientId, sessionId: newSession, requestId } });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.ticket.number, 1);
    const reloaded = await call('GET', `/tickets/active?patientId=${chosen.patientId}&sessionId=${newSession}`, 'rep_b');
    assert.deepEqual(reloaded.body.data, created.body.data);
    const byId = await call('GET', `/tickets/${created.body.data.ticket.ticketId}`, 'rep_b');
    assert.deepEqual(byId.body.data, created.body.data);
  });

  await t.test('API-16 (2.7) retry with the same requestId: 201 then 200 same ticket; conflict 409; after cancel still 200 with CANCELLED', async () => {
    const session = (await call('GET', '/sessions/current', 'staff_01')).body.data;
    const body = { patientId: IDS.p2, sessionId: session.sessionId, requestId: randomUUID() };
    const first = await call('POST', '/tickets', 'rep_a', { json: body });
    assert.equal(first.status, 201);
    const afterFirst = await counts();

    const retry = await call('POST', '/tickets', 'rep_a', { json: body });
    assert.equal(retry.status, 200);
    assert.equal(retry.headers.get('cache-control'), 'no-store');
    assert.deepEqual(retry.body, first.body);
    assert.deepEqual(await counts(), afterFirst, 'a retry writes no ticket and no event');

    const conflict = await call('POST', '/tickets', 'rep_a', { json: { ...body, patientId: IDS.p1 } });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, 'IDEMPOTENCY_CONFLICT');
    assert.equal('data' in conflict.body, false);
    assert.deepEqual(await counts(), afterFirst);

    const cancelled = await call('POST', `/tickets/${first.body.data.ticket.ticketId}/cancel`, 'rep_a'); // Đạt's API (2.13)
    assert.equal(cancelled.status, 200);
    const afterCancel = await counts();
    const late = await call('POST', '/tickets', 'rep_a', { json: body });
    assert.equal(late.status, 200);
    assert.equal(late.body.data.ticket.ticketId, first.body.data.ticket.ticketId);
    assert.equal(late.body.data.ticket.status, 'CANCELLED');
    assert.equal(late.body.data.waitingAhead, null);
    assert.deepEqual(await counts(), afterCancel, 'retry after cancel does not issue a new number');
    const issued = await one(`SELECT count(*)::int AS n FROM ticket_events WHERE ticket_id = $1 AND action = 'ISSUED'`,
      [first.body.data.ticket.ticketId]);
    assert.equal(issued.n, 1);
  });

  await t.test('API-14 unexpected DB errors give the shared generic 500 without SQL detail', async () => {
    await pool.query('ALTER TABLE tickets RENAME TO tickets_hidden_for_test');
    try {
      const res = await call('GET', `/tickets/${tickets.p3.ticketId}`, 'rep_b');
      assert.equal(res.status, 500);
      assert.equal(res.body.error.code, 'INTERNAL_ERROR');
      assert.equal(/tickets|relation|SELECT|postgres/i.test(JSON.stringify(res.body)), false);
    } finally {
      await pool.query('ALTER TABLE tickets_hidden_for_test RENAME TO tickets');
    }
  });

  await t.test('2.13 checks ownership, state and records one cancellation for concurrent requests', async () => {
    const session = (await call('GET', '/sessions/current', 'staff_01')).body.data;
    const shared = (await issue('rep_a', session.sessionId, IDS.p1)).body.data.ticket;
    const privateTicket = (await issue('rep_a', session.sessionId, IDS.p2)).body.data.ticket;
    const path = `/tickets/${privateTicket.ticketId}/cancel`;
    const before = await counts();
    assert.equal((await call('POST', path)).status, 401);
    for (const actor of ['staff_01', 'rep_b']) {
      const denied = await call('POST', path, actor);
      assert.equal(denied.status, 403);
      assert.equal(denied.body.data, undefined);
    }
    assert.equal((await call('POST', path, 'rep_a', { json: {} })).status, 400);
    assert.equal((await call('POST', '/tickets/not-a-uuid/cancel', 'rep_a')).status, 400);
    assert.equal((await call('POST', `/tickets/${randomUUID()}/cancel`, 'rep_a')).status, 404);
    assert.deepEqual(await counts(), before);

    const sharedPath = `/tickets/${shared.ticketId}/cancel`;
    const results = await Promise.all([call('POST', sharedPath, 'rep_b'), call('POST', sharedPath, 'rep_b')]);
    assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
    const success = results.find(({ status }) => status === 200);
    assert.equal(success.body.data.ticket.status, 'CANCELLED');
    assert.equal(success.body.data.ticket.ticketId, shared.ticketId);
    assert.equal(success.body.data.waitingAhead, null);
    assert.equal(results.find(({ status }) => status === 409).body.error.code, 'INVALID_STATE');
    assert.deepEqual((await active(IDS.p1, 'rep_a', session.sessionId)).body, { data: null });
    const events = await pool.query(`SELECT e.from_status, e.to_status, u.username
      FROM ticket_events e JOIN users u ON u.user_id = e.actor_user_id
      WHERE e.ticket_id = $1 AND e.action = 'CANCELLED'`, [shared.ticketId]);
    assert.deepEqual(events.rows, [{ from_status: 'WAITING', to_status: 'CANCELLED', username: 'rep_b' }]);

    await setStatus(privateTicket.ticketId, 'CALLED', true);
    assert.equal((await call('POST', path, 'rep_a')).body.error.code, 'INVALID_STATE');
    assert.equal((await call('GET', `/tickets/${privateTicket.ticketId}`, 'rep_a')).body.data.ticket.status, 'CALLED');
  });

  await t.test('2.13 cancels in STOPPED and rolls back when the audit write fails', async () => {
    const session = (await call('GET', '/sessions/current', 'staff_01')).body.data;
    const waiting = (await active(IDS.p3, 'rep_b', session.sessionId)).body.data.ticket;
    const path = `/tickets/${waiting.ticketId}/cancel`;
    await pool.query(`UPDATE queue_sessions SET status = 'STOPPED', stopped_by = opened_by,
      stopped_at = CURRENT_TIMESTAMP WHERE session_id = $1`, [session.sessionId]);
    await pool.query('ALTER TABLE ticket_events RENAME TO ticket_events_hidden_for_test');
    try {
      const rejected = await call('POST', path, 'rep_b');
      assert.equal(rejected.status, 500);
      assert.equal((await active(IDS.p3, 'rep_b', session.sessionId)).body.data.ticket.status, 'WAITING');
    } finally {
      await pool.query('ALTER TABLE ticket_events_hidden_for_test RENAME TO ticket_events');
    }
    assert.equal((await call('POST', path, 'rep_b')).body.data.ticket.status, 'CANCELLED');
  });
});
