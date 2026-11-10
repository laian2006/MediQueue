import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPatientAccessRepository } from '../../src/modules/patients/patient-access.repository.js';
import { createPatientAccessService } from '../../src/modules/patients/patient-access.service.js';
import { createTicketRepository } from '../../src/modules/tickets/ticket.repository.js';
import { createTicketIssueService } from '../../src/modules/tickets/ticket-issue.service.js';
import { createTicketQueryService } from '../../src/modules/tickets/ticket-query.service.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const IDS = {
  p1: '10000000-0000-4000-8000-000000000001', // rep_a + rep_b
  p2: '10000000-0000-4000-8000-000000000002', // rep_a only
  p3: '10000000-0000-4000-8000-000000000003', // rep_b only
};
const ACTORS = {
  staff: { userId: '00000000-0000-4000-8000-000000000001', role: 'STAFF' },
  repA: { userId: '00000000-0000-4000-8000-000000000002', role: 'REPRESENTATIVE' },
  repB: { userId: '00000000-0000-4000-8000-000000000003', role: 'REPRESENTATIVE' },
};
const TICKET_KEYS = ['createdAt', 'lastCalledAt', 'number', 'patientId', 'sessionId', 'status', 'ticketId', 'updatedAt'];

// No database URL means an explicit skip, never a claimed integration pass.
test('WBS 1.8: ticket API over Express + PostgreSQL', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const { default: express } = await import('express');
  const { default: pg } = await import('pg');
  const { createTicketRouter } = await import('../../src/modules/tickets/ticket.routes.js');
  const schema = `mq_tickets_api_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^mq_tickets_api_[a-f0-9]{32}$/);
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let pool;
  let server;
  let baseUrl;
  let schemaCreated = false;
  const stopServer = async () => {
    if (server?.listening) await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  };
  t.after(async () => {
    try {
      await stopServer();
      if (pool) await pool.end();
      if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await admin.end();
    }
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public`, max: 10 });
  for (const file of ['migrations/001_identity.sql', 'seeds/001_identity.sql', 'migrations/002_sessions.sql', 'migrations/003_tickets.sql']) {
    await pool.query(await read(`../../../database/${file}`));
  }
  // TEST DOUBLES ONLY: stand in for Trực's transaction.js and TicketEvent helper (WBS 1.19).
  await pool.query(`CREATE TABLE test_ticket_events (ticket_id UUID NOT NULL REFERENCES tickets(ticket_id),
    actor_user_id UUID NOT NULL, action TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL)`);
  async function withTransaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  const appendTicketEvent = (client, e) => client.query('INSERT INTO test_ticket_events VALUES ($1, $2, $3, $4, $5)',
    [e.ticketId, e.actorUserId, e.action, e.fromStatus, e.toStatus]);

  const patientAccess = createPatientAccessService({ repository: createPatientAccessRepository(pool) });
  const issueService = createTicketIssueService({
    db: pool, withTransaction, createRepository: createTicketRepository, patientAccess, appendTicketEvent,
  });
  const queryService = createTicketQueryService({ db: pool, createRepository: createTicketRepository, patientAccess });

  function makeApp(services = { issueService, queryService }) {
    const app = express();
    app.use(express.json());
    // TEST DOUBLE ONLY. Production uses Hưng's createAuthenticate (cookie mediqueue.sid).
    const authenticate = (req, res, next) => {
      const actor = ACTORS[req.get('x-test-actor')];
      if (!actor) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Bạn cần đăng nhập.' } });
      req.user = actor;
      next();
    };
    app.use('/api/v1/tickets', createTicketRouter({ ...services, authenticate }));
    app.use((error, _req, res, _next) => {
      const badJson = error.type === 'entity.parse.failed';
      res.status(badJson ? 400 : 500).json({ error: {
        code: badJson ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
        message: badJson ? 'JSON không hợp lệ.' : 'Lỗi hệ thống.',
      } });
    });
    return app;
  }
  async function start(app = makeApp()) {
    await stopServer();
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/tickets`;
  }
  async function call(method, path, actor, { json, raw, contentType } = {}) {
    const headers = actor ? { 'x-test-actor': actor } : {};
    let body;
    if (json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
    if (raw !== undefined) { headers['content-type'] = contentType; body = raw; }
    const response = await fetch(baseUrl + path, { method, headers, body });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  const issue = (actor, sessionId, patientId, requestId = randomUUID()) =>
    call('POST', '', actor, { json: { patientId, sessionId, requestId } });
  const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
  const ticketCount = async () => (await one('SELECT count(*)::int AS n FROM tickets')).n;
  const sessionId = (await one(`INSERT INTO queue_sessions (opened_by) VALUES ($1) RETURNING session_id`,
    [ACTORS.staff.userId])).session_id;
  const active = (patientId, actor, sid = sessionId) => call('GET', `/active?patientId=${patientId}&sessionId=${sid}`, actor);
  const setStatus = (ticketId, status, called = false) => pool.query(`UPDATE tickets SET status = $2,
    last_called_at = CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE last_called_at END, updated_at = CURRENT_TIMESTAMP
    WHERE ticket_id = $1`, [ticketId, status, called]); // test data only; real transitions are 1.10/1.11/2.13

  await start();
  const tickets = {};

  await t.test('API-01 POST → 201 {data:{ticket, waitingAhead}}; first ticket has nobody ahead', async () => {
    const res = await issue('repA', sessionId, IDS.p2);
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Object.keys(res.body), ['data']);
    assert.deepEqual(Object.keys(res.body.data).sort(), ['ticket', 'waitingAhead']);
    assert.deepEqual(Object.keys(res.body.data.ticket).sort(), TICKET_KEYS);
    assert.equal(res.body.data.ticket.status, 'WAITING');
    assert.equal(res.body.data.ticket.number, 1);
    assert.equal(res.body.data.waitingAhead, 0);
    tickets.p2 = res.body.data.ticket;
  });

  await t.test('API-02 second patient → #2 with one WAITING ahead', async () => {
    const res = await issue('repA', sessionId, IDS.p1);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.ticket.number, 2);
    assert.equal(res.body.data.waitingAhead, 1);
    tickets.p1 = res.body.data.ticket;
  });

  await t.test('API-03 GET /:id by another representative of the same patient → 200', async () => {
    const res = await call('GET', `/${tickets.p1.ticketId}`, 'repB');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.ticket, tickets.p1);
    assert.equal(res.body.data.waitingAhead, 1);
  });

  await t.test('API-04 GET /:id without PatientAccess → 403 and no ticket field in the body', async () => {
    const res = await call('GET', `/${tickets.p2.ticketId}`, 'repB');
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
    assert.equal('data' in res.body, false);
    assert.equal(JSON.stringify(res.body).includes(tickets.p2.ticketId), false);
    assert.equal(JSON.stringify(res.body).includes(IDS.p2), false);
  });

  await t.test('API-05 GET /:id unknown → 404; malformed → 400; STAFF → 403; no login → 401', async () => {
    assert.equal((await call('GET', `/${randomUUID()}`, 'repA')).status, 404);
    assert.equal((await call('GET', '/not-a-uuid', 'repA')).body.error.code, 'VALIDATION_ERROR');
    assert.equal((await call('GET', `/${tickets.p1.ticketId}`, 'staff')).status, 403);
    assert.equal((await call('GET', `/${tickets.p1.ticketId}`)).status, 401);
  });

  await t.test('API-06 GET /active: found, null, 403 outside access, 400 bad query', async () => {
    const found = await active(IDS.p1, 'repB');
    assert.equal(found.status, 200);
    assert.equal(found.body.data.ticket.ticketId, tickets.p1.ticketId);
    const none = await active(IDS.p3, 'repB');
    assert.equal(none.status, 200);
    assert.deepEqual(none.body, { data: null });
    assert.equal((await active(IDS.p3, 'repA')).status, 403);
    assert.equal((await call('GET', `/active?patientId=${IDS.p1}`, 'repA')).status, 400);
    assert.equal((await call('GET', `/active?patientId=${IDS.p1}&sessionId=${sessionId}&x=1`, 'repA')).status, 400);
    assert.equal((await call('GET', `/active?patientId=${IDS.p1}&patientId=${IDS.p1}&sessionId=${sessionId}`, 'repA')).status, 400);
    assert.equal((await active(IDS.p1, 'staff')).status, 403);
  });

  await t.test('API-07 second representative, same patient → 409 ACTIVE_TICKET_EXISTS with details.ticketId', async () => {
    const before = await ticketCount();
    const res = await issue('repB', sessionId, IDS.p1);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'ACTIVE_TICKET_EXISTS');
    assert.deepEqual(res.body.error.details, { ticketId: tickets.p1.ticketId });
    assert.equal(await ticketCount(), before);
  });

  await t.test('API-08 waitingAhead skips CANCELLED and CALLED; CALLED ticket shows null', async () => {
    const third = await issue('repB', sessionId, IDS.p3);
    assert.equal(third.body.data.ticket.number, 3);
    assert.equal(third.body.data.waitingAhead, 2);
    tickets.p3 = third.body.data.ticket;

    await setStatus(tickets.p2.ticketId, 'CANCELLED');
    assert.equal((await call('GET', `/${tickets.p3.ticketId}`, 'repB')).body.data.waitingAhead, 1);

    await setStatus(tickets.p1.ticketId, 'CALLED', true);
    assert.equal((await call('GET', `/${tickets.p3.ticketId}`, 'repB')).body.data.waitingAhead, 0);
    const called = await call('GET', `/${tickets.p1.ticketId}`, 'repA');
    assert.equal(called.body.data.ticket.status, 'CALLED');
    assert.equal(called.body.data.waitingAhead, null);
    assert.notEqual(called.body.data.ticket.lastCalledAt, null);
    assert.equal((await active(IDS.p1, 'repB')).body.data.ticket.status, 'CALLED');
  });

  await t.test('API-09 ended tickets stay readable by id but are not "active"', async () => {
    const res = await call('GET', `/${tickets.p2.ticketId}`, 'repA');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.ticket.status, 'CANCELLED');
    assert.equal(res.body.data.waitingAhead, null);
    assert.deepEqual((await active(IDS.p2, 'repA')).body, { data: null });
  });

  await t.test('API-10 POST rejections write nothing', async () => {
    const before = await ticketCount();
    const body = { patientId: IDS.p2, sessionId, requestId: randomUUID() };
    const cases = [
      [await call('POST', '', undefined, { json: body }), 401, 'UNAUTHENTICATED'],
      [await call('POST', '', 'staff', { json: body }), 403, 'FORBIDDEN'],
      [await issue('repA', sessionId, IDS.p3), 403, 'FORBIDDEN'],
      [await call('POST', '', 'repA', { raw: JSON.stringify(body), contentType: 'text/plain' }), 400, 'VALIDATION_ERROR'],
      [await call('POST', '', 'repA', { raw: '{"patientId":', contentType: 'application/json' }), 400, 'VALIDATION_ERROR'],
      [await call('POST', '', 'repA', { json: [body] }), 400, 'VALIDATION_ERROR'],
      [await call('POST', '', 'repA', { json: { ...body, number: 1 } }), 400, 'VALIDATION_ERROR'],
      [await call('POST', '', 'repA'), 400, 'VALIDATION_ERROR'],
      [await issue('repA', randomUUID(), IDS.p2), 404, 'NOT_FOUND'],
    ];
    const MALFORMED_JSON = 4; // rejected by app-level express.json() before this router runs
    cases.forEach(([res, status, code], index) => {
      assert.equal(res.status, status, code);
      assert.equal(res.body.error.code, code);
      // The shared app error handler (WBS 1.19) owns headers for parse errors; see docs/testing/cases/1-8.md.
      if (index !== MALFORMED_JSON) assert.equal(res.headers.get('cache-control'), 'no-store');
    });
    assert.equal(await ticketCount(), before);
  });

  await t.test('API-11 STOPPED session → 409 INVALID_STATE; existing tickets stay readable', async () => {
    await pool.query(`UPDATE queue_sessions SET status = 'STOPPED', stopped_by = $1, stopped_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE session_id = $2`, [ACTORS.staff.userId, sessionId]);
    const res = await issue('repA', sessionId, IDS.p2);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INVALID_STATE');
    assert.equal((await call('GET', `/${tickets.p3.ticketId}`, 'repB')).body.data.waitingAhead, 0);
  });

  await t.test('API-12 restarting the API keeps tickets in PostgreSQL', async () => {
    await start(makeApp());
    const res = await call('GET', `/${tickets.p3.ticketId}`, 'repB');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.ticket.number, 3);
  });

  await t.test('API-13 unexpected DB errors become a generic 500 without internal detail', async () => {
    const broken = createTicketQueryService({ db: pool, patientAccess, createRepository: () => ({
      findViewById: async () => { throw Object.assign(new Error('relation "secret_table" does not exist'), { code: '42P01' }); },
      findActiveView: async () => null,
    }) });
    await start(makeApp({ issueService, queryService: broken }));
    const res = await call('GET', `/${tickets.p3.ticketId}`, 'repB');
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: { code: 'INTERNAL_ERROR', message: 'Lỗi hệ thống.' } });
    await start(makeApp());
  });

  await t.test('API-14 router refuses to start without shared authentication or services', () => {
    assert.throws(() => createTicketRouter({ issueService, queryService }), TypeError);
    assert.throws(() => createTicketRouter({ queryService, authenticate: () => {} }), TypeError);
    assert.throws(() => createTicketRouter({ issueService, authenticate: () => {} }), TypeError);
  });
});
