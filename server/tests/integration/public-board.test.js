import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createApp } from '../../src/app/app.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const STAFF = '00000000-0000-4000-8000-000000000001';

test('WBS 1.20: public board on real PostgreSQL, anonymous access and privacy', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const schema = `mq_board_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let pool;
  let app;
  let server;
  t.after(async () => {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    if (app) await app.locals.sessionStore.close();
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
  await pool.query(await read('../../../database/migrations/001_identity.sql'));
  await pool.query(await read('../../../database/migrations/002_sessions.sql'));
  // Until 1.7 merges, use an exact test-only copy of 003 from 3d570ca.
  // This is NOT installed by db:migrate and does not claim real issue/call API integration.
  let ticketSql;
  try { ticketSql = await read('../../../database/migrations/003_tickets.sql'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    ticketSql = await read('../fixtures/public-board.tickets.sql');
  }
  await pool.query(ticketSql);
  await pool.query(await read('../../../database/seeds/001_identity.sql'));
  app = createApp({ pool, config: {
    clientOrigin: 'http://localhost:5173', sessionSecret: 'test-only-secret-'.repeat(4),
    cookieSecure: false, noShowTimeoutSeconds: 60, sessionSchema: schema,
  } });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/v1/public/board`;
  async function snapshot() {
    const before = Date.now();
    const response = await fetch(base);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('set-cookie'), null);
    const body = await response.json();
    assert.deepEqual(Object.keys(body), ['data']);
    assert.deepEqual(Object.keys(body.data).sort(), ['currentTicket', 'updatedAt', 'waitingNumbers']);
    assert.ok(Date.parse(body.data.updatedAt) >= before - 1000);
    assert.ok(Date.parse(body.data.updatedAt) <= Date.now() + 1000);
    return body.data;
  }
  async function addTicket(sessionId, number, status) {
    const patientId = randomUUID();
    await pool.query('INSERT INTO patient_profiles (patient_id, code, display_name) VALUES ($1,$2,$3)',
      [patientId, `PRIVATE-${patientId}`, 'PRIVATE PATIENT NAME']);
    return (await pool.query(`INSERT INTO tickets (session_id, patient_id, issued_by_user_id, request_id, number, status)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING ticket_id`, [sessionId, patientId, STAFF, randomUUID(), number, status])).rows[0].ticket_id;
  }
  let sessionId;
  let currentTicketId;
  await t.test('no active session returns null and empty list without authentication', async () => {
    const data = await snapshot();
    assert.equal(data.currentTicket, null);
    assert.deepEqual(data.waitingNumbers, []);
    const oldSession = (await pool.query('INSERT INTO queue_sessions (opened_by) VALUES ($1) RETURNING session_id', [STAFF])).rows[0].session_id;
    await addTicket(oldSession, 99, 'CALLED');
    await pool.query(`UPDATE queue_sessions SET status='CLOSED', stopped_by=$1, stopped_at=CURRENT_TIMESTAMP,
      closed_by=$1, closed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE session_id=$2`, [STAFF, oldSession]);
    assert.equal((await snapshot()).currentTicket, null);
  });
  await t.test('empty OPEN session has no called/waiting ticket', async () => {
    sessionId = (await pool.query('INSERT INTO queue_sessions (opened_by) VALUES ($1) RETURNING session_id', [STAFF])).rows[0].session_id;
    assert.equal((await snapshot()).currentTicket, null);
  });
  await t.test('only current session, current slot and sorted WAITING numbers are public', async () => {
    for (const [number, status] of [[8, 'WAITING'], [3, 'WAITING'], [4, 'CANCELLED'], [5, 'COMPLETED'], [6, 'NO_SHOW']]) {
      await addTicket(sessionId, number, status);
    }
    currentTicketId = await addTicket(sessionId, 2, 'CALLED');
    const data = await snapshot();
    assert.deepEqual(data.currentTicket, { number: 2, status: 'CALLED' });
    assert.deepEqual(data.waitingNumbers, [3, 8]);
    const text = JSON.stringify(data);
    assert.doesNotMatch(text, /PRIVATE|patient|user|ticketId|sessionId|displayName|password|[0-9a-f]{8}-[0-9a-f]{4}/i);
    // Filters supplied by a visitor must never select a different private DTO.
    const withQuery = await fetch(`${base}?patientId=${randomUUID()}&include=patient`);
    assert.deepEqual((await withQuery.json()).data.currentTicket, { number: 2, status: 'CALLED' });
  });
  await t.test('REGISTERING and STOPPED stay visible; completed/cancelled tickets disappear', async () => {
    await pool.query("UPDATE tickets SET status='REGISTERING' WHERE ticket_id=$1", [currentTicketId]);
    assert.deepEqual((await snapshot()).currentTicket, { number: 2, status: 'REGISTERING' });
    await pool.query("UPDATE queue_sessions SET status='STOPPED', stopped_by=$1, stopped_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE session_id=$2", [STAFF, sessionId]);
    assert.deepEqual((await snapshot()).waitingNumbers, [3, 8]);
    await pool.query("UPDATE tickets SET status='COMPLETED' WHERE ticket_id=$1", [currentTicketId]);
    await pool.query("UPDATE tickets SET status='CANCELLED' WHERE session_id=$1 AND status='WAITING'", [sessionId]);
    const data = await snapshot();
    assert.equal(data.currentTicket, null);
    assert.deepEqual(data.waitingNumbers, []);
  });
  await t.test('read is anonymous and creates neither auth session nor business writes', async () => {
    const before = (await pool.query('SELECT count(*) FROM tickets')).rows[0].count;
    await snapshot();
    assert.equal((await pool.query('SELECT count(*) FROM tickets')).rows[0].count, before);
    assert.equal((await pool.query('SELECT to_regclass($1) AS name', [`${schema}.auth_sessions`])).rows[0].name, null);
  });
  await t.test('missing dependent table fails generically instead of serving a fake empty board', async () => {
    await pool.query('ALTER TABLE tickets RENAME TO tickets_unavailable');
    const response = await fetch(base);
    assert.equal(response.status, 500);
    const body = await response.text();
    assert.doesNotMatch(body, /tickets_unavailable|relation|SQL|postgres|password|PRIVATE/i);
    assert.equal(JSON.parse(body).error.code, 'INTERNAL_ERROR');
  });
});
