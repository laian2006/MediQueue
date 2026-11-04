import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPatientAccessRepository } from '../../src/modules/patients/patient-access.repository.js';
import { createPatientAccessService } from '../../src/modules/patients/patient-access.service.js';
import { createTicketRepository } from '../../src/modules/tickets/ticket.repository.js';
import { createTicketIssueService, SESSION_NOT_OPEN_CODE } from '../../src/modules/tickets/ticket-issue.service.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const IDS = {
  staff: '00000000-0000-4000-8000-000000000001',
  repA: '00000000-0000-4000-8000-000000000002',
  repB: '00000000-0000-4000-8000-000000000003',
  p1: '10000000-0000-4000-8000-000000000001', // shared by rep_a and rep_b
  p2: '10000000-0000-4000-8000-000000000002', // rep_a only
  p3: '10000000-0000-4000-8000-000000000003', // rep_b only
};
const repA = { userId: IDS.repA, role: 'REPRESENTATIVE' };
const repB = { userId: IDS.repB, role: 'REPRESENTATIVE' };
const staff = { userId: IDS.staff, role: 'STAFF' };

// No database URL means an explicit skip, never a claimed integration pass.
test('WBS 1.7: ticket schema and transactional number allocation on PostgreSQL', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const { default: pg } = await import('pg');
  const schema = `mq_tickets_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^mq_tickets_test_[a-f0-9]{32}$/);
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let pool;
  let schemaCreated = false;
  t.after(async () => {
    try {
      if (pool) await pool.end();
      if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await admin.end();
    }
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public`, max: 20 });

  // Real order: 001 → seed → 002 → 003. 004_ticket_events waits for Trực's design (1.19).
  for (const file of ['migrations/001_identity.sql', 'seeds/001_identity.sql', 'migrations/002_sessions.sql', 'migrations/003_tickets.sql']) {
    await pool.query(await read(`../../../database/${file}`));
  }
  // TEST DOUBLE ONLY: stands in for TicketEvent until 004 and append-ticket-event.js exist.
  await pool.query(`CREATE TABLE test_ticket_events (
    ticket_id UUID NOT NULL REFERENCES tickets(ticket_id), actor_user_id UUID NOT NULL,
    action TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL)`);

  // TEST DOUBLE ONLY: stands in for Trực's shared transaction.js.
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
  let failNextEvent = false;
  async function appendTicketEvent(client, e) {
    await client.query(`INSERT INTO test_ticket_events VALUES ($1, $2, $3, $4, $5)`,
      [e.ticketId, e.actorUserId, e.action, e.fromStatus, e.toStatus]);
    if (failNextEvent) { failNextEvent = false; throw new Error('simulated failure after event insert'); }
  }

  const patientAccess = createPatientAccessService({ repository: createPatientAccessRepository(pool) });
  const service = createTicketIssueService({
    db: pool, withTransaction, createRepository: createTicketRepository, patientAccess, appendTicketEvent,
  });

  const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
  const counts = async (sessionId) => one(`SELECT
      (SELECT count(*)::int FROM tickets) AS tickets,
      (SELECT count(*)::int FROM test_ticket_events) AS events,
      (SELECT last_issued_number FROM queue_sessions WHERE session_id = $1) AS counter`, [sessionId]);
  const openSession = async () => (await one(
    'INSERT INTO queue_sessions (opened_by) VALUES ($1) RETURNING session_id', [IDS.staff])).session_id;
  const issue = (actor, sessionId, patientId, requestId = randomUUID()) =>
    service.issue(actor, { patientId, sessionId, requestId });
  const rejectsWith = (promise, statusCode, code) =>
    assert.rejects(promise, (error) => error.statusCode === statusCode && error.code === code);

  const sessionId = await openSession();

  await t.test('OPEN + PatientAccess → WAITING #1 in that session, counter 1, one ISSUED event', async () => {
    const ticket = await issue(repA, sessionId, IDS.p2);
    assert.deepEqual(Object.keys(ticket).sort(),
      ['createdAt', 'lastCalledAt', 'number', 'patientId', 'sessionId', 'status', 'ticketId', 'updatedAt']);
    assert.equal(ticket.status, 'WAITING');
    assert.equal(ticket.number, 1);
    assert.equal(ticket.sessionId, sessionId);
    assert.equal(ticket.lastCalledAt, null);
    assert.equal(new Date(ticket.createdAt).toISOString(), ticket.createdAt);
    const row = await one('SELECT issued_by_user_id FROM tickets WHERE ticket_id = $1', [ticket.ticketId]);
    assert.equal(row.issued_by_user_id, IDS.repA);
    assert.deepEqual(await one('SELECT action, from_status, to_status, actor_user_id FROM test_ticket_events WHERE ticket_id = $1',
      [ticket.ticketId]), { action: 'ISSUED', from_status: null, to_status: 'WAITING', actor_user_id: IDS.repA });
    assert.deepEqual(await counts(sessionId), { tickets: 1, events: 1, counter: 1 });
  });

  let sharedTicket;
  await t.test('second patient gets #2; one account may issue for several authorised patients', async () => {
    sharedTicket = await issue(repA, sessionId, IDS.p1);
    assert.equal(sharedTicket.number, 2);
    assert.equal(sharedTicket.patientId, IDS.p1);
  });

  await t.test('another representative of the same patient → 409 ACTIVE_TICKET_EXISTS, no write', async () => {
    await assert.rejects(issue(repB, sessionId, IDS.p1), (error) => error.statusCode === 409
      && error.code === 'ACTIVE_TICKET_EXISTS' && error.details.ticketId === sharedTicket.ticketId);
    assert.deepEqual(await counts(sessionId), { tickets: 2, events: 2, counter: 2 });
  });

  await t.test('patient outside PatientAccess and STAFF are 403; nothing is written', async () => {
    await rejectsWith(issue(repA, sessionId, IDS.p3), 403, 'FORBIDDEN');
    await rejectsWith(issue(staff, sessionId, IDS.p3), 403, 'FORBIDDEN');
    await rejectsWith(issue(repA, sessionId, randomUUID()), 403, 'FORBIDDEN'); // unknown patient
    assert.deepEqual(await counts(sessionId), { tickets: 2, events: 2, counter: 2 });
  });

  await t.test('unknown sessionId → 404 NOT_FOUND', async () => {
    await rejectsWith(issue(repB, randomUUID(), IDS.p3), 404, 'NOT_FOUND');
    assert.equal((await counts(sessionId)).tickets, 2);
  });

  await t.test('event failure rolls back ticket, counter and event together', async () => {
    failNextEvent = true;
    await assert.rejects(issue(repB, sessionId, IDS.p3), /simulated failure/);
    assert.deepEqual(await counts(sessionId), { tickets: 2, events: 2, counter: 2 });
  });

  await t.test('ended ticket frees the patient but its number is never reused', async () => {
    await pool.query(`UPDATE tickets SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE ticket_id = $1`,
      [sharedTicket.ticketId]); // test data only; real cancellation is WBS 2.13
    const again = await issue(repB, sessionId, IDS.p1);
    assert.equal(again.number, 3);
    const numbers = (await pool.query('SELECT number FROM tickets WHERE session_id = $1 ORDER BY number', [sessionId]))
      .rows.map((r) => r.number);
    assert.deepEqual(numbers, [1, 2, 3]);
  });

  await t.test('same sender reusing a requestId → 409 in Sprint 1, no second ticket', async () => {
    const requestId = randomUUID();
    await issue(repB, sessionId, IDS.p3, requestId);
    const before = await counts(sessionId);
    await pool.query(`UPDATE tickets SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE request_id = $1`, [requestId]);
    await rejectsWith(issue(repB, sessionId, IDS.p3, requestId), 409, 'IDEMPOTENCY_CONFLICT');
    assert.deepEqual(await counts(sessionId), before);
  });

  await t.test('STOPPED and CLOSED sessions issue nothing', async () => {
    await pool.query(`UPDATE queue_sessions SET status = 'STOPPED', stopped_by = $1, stopped_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE session_id = $2`, [IDS.staff, sessionId]); // test data; real stop is WBS 2.1
    const before = await counts(sessionId);
    await rejectsWith(issue(repA, sessionId, IDS.p2), 409, SESSION_NOT_OPEN_CODE);
    await pool.query(`UPDATE tickets SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE session_id = $1`, [sessionId]);
    await pool.query(`UPDATE queue_sessions SET status = 'CLOSED', closed_by = $1, closed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE session_id = $2`, [IDS.staff, sessionId]);
    await rejectsWith(issue(repA, sessionId, IDS.p2), 409, SESSION_NOT_OPEN_CODE);
    const after = await counts(sessionId);
    assert.deepEqual({ tickets: after.tickets, events: after.events, counter: after.counter }, before);
  });

  await t.test('a new session starts its own sequence at 1', async () => {
    const next = await openSession();
    assert.equal((await issue(repA, next, IDS.p2)).number, 1);
  });

  await t.test('parallel requests: distinct numbers; same patient via two representatives → one ticket', async () => {
    await pool.query(`UPDATE tickets SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE status = 'WAITING'`);
    const current = (await one(`SELECT session_id FROM queue_sessions WHERE status = 'OPEN'`)).session_id;
    const results = await Promise.allSettled([
      issue(repA, current, IDS.p1), issue(repB, current, IDS.p1),
      issue(repA, current, IDS.p2), issue(repB, current, IDS.p3),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const failed = results.filter((r) => r.status === 'rejected').map((r) => r.reason);
    assert.equal(ok.length, 3);
    assert.equal(failed.length, 1);
    assert.equal(failed[0].code, 'ACTIVE_TICKET_EXISTS');
    assert.equal(new Set(ok.map((x) => x.number)).size, 3);
    const db = await pool.query(`SELECT patient_id, count(*)::int AS n FROM tickets
      WHERE session_id = $1 AND status IN ('WAITING','CALLED','REGISTERING') GROUP BY patient_id`, [current]);
    assert.ok(db.rows.every((r) => r.n === 1));
    const session = await one('SELECT last_issued_number FROM queue_sessions WHERE session_id = $1', [current]);
    assert.equal(session.last_issued_number, 4); // #1 earlier + three parallel successes, no gaps
  });

  await t.test('DB constraints hold even when the service is bypassed', async () => {
    const current = (await one(`SELECT session_id FROM queue_sessions WHERE status = 'OPEN'`)).session_id;
    const base = (await one(`SELECT * FROM tickets WHERE session_id = $1 AND status = 'WAITING' ORDER BY number LIMIT 1`, [current]));
    const insert = (fields) => {
      const v = { session_id: current, patient_id: IDS.p2, issued_by_user_id: IDS.repA,
        request_id: randomUUID(), number: 99, status: 'CANCELLED', ...fields };
      return pool.query(`INSERT INTO tickets (session_id, patient_id, issued_by_user_id, request_id, number, status)
        VALUES ($1, $2, $3, $4, $5, $6)`, [v.session_id, v.patient_id, v.issued_by_user_id, v.request_id, v.number, v.status]);
    };
    const violates = (constraint) => (error) => error.code === '23505' && error.constraint === constraint;
    await assert.rejects(insert({ number: base.number }), violates('uq_tickets_session_number'));
    await assert.rejects(insert({ patient_id: base.patient_id, status: 'WAITING' }), violates('uq_tickets_active_patient'));
    await assert.rejects(insert({ issued_by_user_id: base.issued_by_user_id, request_id: base.request_id }),
      violates('uq_tickets_request'));
    await pool.query(`UPDATE tickets SET status = 'CALLED', last_called_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE ticket_id = $1`, [base.ticket_id]);
    // A patient with no active ticket, so only the counter-slot index can reject the row.
    const free = (await one(`INSERT INTO patient_profiles (code, display_name)
      VALUES ('T900', 'Hồ sơ thử ràng buộc') RETURNING patient_id`)).patient_id;
    await assert.rejects(insert({ patient_id: free, status: 'REGISTERING', number: 100 }), violates('uq_tickets_counter_slot'));
    await assert.rejects(insert({ number: 0 }), (error) => error.code === '23514');
    await assert.rejects(insert({ status: 'DONE' }), (error) => error.code === '23514');
    await assert.rejects(insert({ session_id: randomUUID() }), (error) => error.code === '23503');
  });
});
