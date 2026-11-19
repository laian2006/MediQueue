import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createApp } from '../../src/app/app.js';
import { migrate, seed } from '../../src/shared/db/migrations.js';

test('WBS 1.20: real login, issuance, audit rollback and public board', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const schema = `mq_board_flow_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let pool;
  let app;
  let server;
  let base;
  const origin = 'http://localhost:5173';
  const config = { clientOrigin: origin, sessionSecret: 'board-flow-test-only-'.repeat(4),
    cookieSecure: false, noShowTimeoutSeconds: 60, sessionSchema: schema };
  async function stop() {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    if (app) await app.locals.sessionStore.close();
    app = undefined;
  }
  t.after(async () => {
    try {
      await stop();
      if (pool) await pool.end();
      // The schema name is generated above, never taken from a user/database record.
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally { await admin.end(); }
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${schema},pg_catalog` });
  await migrate(pool, fileURLToPath(new URL('../../../database/migrations/', import.meta.url)));
  await seed(pool, fileURLToPath(new URL('../../../database/seeds/', import.meta.url)));
  async function start() {
    await stop();
    app = createApp({ pool, config });
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
  }
  await start();
  async function call(method, path, cookie, json) {
    const headers = { Origin: origin };
    if (cookie) headers.Cookie = cookie;
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + path, { method, headers,
      body: json === undefined ? undefined : JSON.stringify(json) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  async function login(username) {
    const res = await call('POST', '/auth/login', undefined, { username, password: 'Demo@12345' });
    assert.equal(res.status, 200);
    return res.headers.get('set-cookie').split(';')[0];
  }
  async function board() {
    const res = await call('GET', '/public/board');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('set-cookie'), null);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Object.keys(res.body), ['data']);
    assert.deepEqual(Object.keys(res.body.data).sort(), ['currentTicket', 'updatedAt', 'waitingNumbers']);
    if (res.body.data.currentTicket) {
      assert.deepEqual(Object.keys(res.body.data.currentTicket).sort(), ['number', 'status']);
    }
    assert.doesNotMatch(JSON.stringify(res.body), /patient|userId|ticketId|sessionId|displayName|[a-f0-9]{8}-[a-f0-9]{4}/i);
    return res.body.data;
  }
  const staff = await login('staff_01');
  const representative = await login('rep_a');
  const opened = await call('POST', '/sessions', staff, {});
  assert.equal(opened.status, 201);
  const sessionId = opened.body.data.sessionId;
  const patients = await call('GET', '/patients', representative);
  assert.equal(patients.status, 200);
  assert.equal(patients.body.data.length, 2);
  const issue = (patientId) => call('POST', '/tickets', representative,
    { sessionId, patientId, requestId: randomUUID() });
  let first;
  await t.test('authorized selection and issue API put the stored number on the anonymous board', async () => {
    const res = await issue(patients.body.data[0].patientId);
    assert.equal(res.status, 201);
    first = res.body.data.ticket;
    const data = await board();
    assert.equal(data.currentTicket, null);
    assert.deepEqual(data.waitingNumbers, [first.number]);
    const events = await pool.query('SELECT action, from_status, to_status FROM ticket_events WHERE ticket_id=$1', [first.ticketId]);
    assert.deepEqual(events.rows, [{ action: 'ISSUED', from_status: null, to_status: 'WAITING' }]);
  });
  await t.test('database audit failure rolls back the ticket, allocation and board change', async () => {
    const before = await board();
    const beforeCount = await pool.query('SELECT count(*)::int AS count FROM ticket_events');
    await pool.query(`CREATE FUNCTION reject_board_test_event() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'board test event failure'; END; $$`);
    await pool.query(`CREATE TRIGGER reject_board_test_event BEFORE INSERT ON ticket_events
      FOR EACH ROW EXECUTE FUNCTION reject_board_test_event()`);
    try {
      const failed = await issue(patients.body.data[1].patientId);
      assert.equal(failed.status, 500);
      assert.equal(failed.body.error.code, 'INTERNAL_ERROR');
      assert.doesNotMatch(JSON.stringify(failed.body), /board test event failure|INSERT|postgres/i);
      assert.deepEqual((await board()).waitingNumbers, before.waitingNumbers);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM tickets')).rows[0].count, 1);
      assert.deepEqual((await pool.query('SELECT count(*)::int AS count FROM ticket_events')).rows, beforeCount.rows);
      assert.equal((await pool.query('SELECT last_issued_number FROM queue_sessions WHERE session_id=$1', [sessionId])).rows[0].last_issued_number, first.number);
    } finally {
      await pool.query('DROP TRIGGER reject_board_test_event ON ticket_events');
      await pool.query('DROP FUNCTION reject_board_test_event()');
    }
    const retried = await issue(patients.body.data[1].patientId);
    assert.equal(retried.status, 201);
    assert.equal(retried.body.data.ticket.number, first.number + 1);
    assert.deepEqual((await board()).waitingNumbers, [first.number, first.number + 1]);
  });
  await t.test('real call-next API moves FIFO ticket from waiting to current', async () => {
    const called = await call('POST', '/queue/call-next', staff, { sessionId });
    assert.equal(called.status, 200);
    assert.equal(called.body.data.ticketId, first.ticketId);
    const data = await board();
    assert.deepEqual(data.currentTicket, { number: first.number, status: 'CALLED' });
    assert.deepEqual(data.waitingNumbers, [first.number + 1]);
    const busy = await call('POST', '/queue/call-next', staff, { sessionId });
    assert.equal(busy.status, 409);
    assert.deepEqual((await board()).currentTicket, data.currentTicket);
  });
  await t.test('API restart preserves the public snapshot and real staff cookie', async () => {
    const before = await board();
    await start();
    const after = await board();
    assert.deepEqual(after.currentTicket, before.currentTicket);
    assert.deepEqual(after.waitingNumbers, before.waitingNumbers);
    assert.equal((await call('GET', '/auth/me', staff)).status, 200);
  });
});
