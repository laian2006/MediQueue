import assert from 'node:assert/strict';
import test from 'node:test';
import { createTicketIssueService, SESSION_NOT_OPEN_CODE } from '../ticket-issue.service.js';
import { toTicketDto } from '../ticket.dto.js';

const rep = { userId: '00000000-0000-4000-8000-000000000002', role: 'REPRESENTATIVE' };
const staff = { userId: '00000000-0000-4000-8000-000000000001', role: 'STAFF' };
const input = {
  patientId: '10000000-0000-4000-8000-000000000001',
  sessionId: '20000000-0000-4000-8000-000000000001',
  requestId: '30000000-0000-4000-8000-000000000001',
};
const ticketRow = {
  ticket_id: '40000000-0000-4000-8000-000000000001',
  session_id: input.sessionId, patient_id: input.patientId, number: 5, status: 'WAITING',
  last_called_at: null,
  created_at: new Date('2026-11-04T08:00:00+07:00'), updated_at: new Date('2026-11-04T08:00:00+07:00'),
  issued_by_user_id: rep.userId, request_id: input.requestId,
};
const matchesError = (statusCode, code) => (error) => error.statusCode === statusCode && error.code === code;

// Records every step so tests can check order, actor and that nothing ran after a rejection.
function setup({ session = { session_id: input.sessionId, status: 'OPEN', last_issued_number: 4 },
  active = null, insertError, eventError, access = async () => {}, byKey = () => null } = {}) {
  let keyCalls = 0;
  const calls = [];
  const client = { query: async () => { throw new Error('repository double only'); } };
  const pool = { query: async () => { throw new Error('repository double only'); } };
  const createRepository = (db) => ({
    lockSession: async (id) => { calls.push(['lock', db === client, id]); return session; },
    findByRequestKey: async (uid, rid) => { calls.push(['key', db === client, uid, rid]); return byKey(db === client, keyCalls++); },
    findActiveForPatient: async (sid, pid) => { calls.push(['active', db === client, sid, pid]); return active; },
    allocateNumber: async (id) => { calls.push(['allocate', db === client, id]); return session.last_issued_number + 1; },
    insertWaiting: async (values) => {
      calls.push(['insert', db === client, values]);
      if (insertError) throw insertError;
      return { ...ticketRow, number: values.number };
    },
  });
  let committed = false;
  const withTransaction = async (db, fn) => {
    calls.push(['begin', db === pool]);
    const result = await fn(client); // a throw here means rollback; commit only on success
    committed = true;
    return result;
  };
  const appendTicketEvent = async (db, event) => {
    calls.push(['event', db === client, event]);
    if (eventError) throw eventError;
  };
  const patientAccess = { assertCanAccessPatient: async (actor, patientId) => {
    calls.push(['access', actor.userId, patientId]);
    return access(actor, patientId);
  } };
  const service = createTicketIssueService({ db: pool, withTransaction, createRepository, patientAccess, appendTicketEvent });
  return { service, calls, isCommitted: () => committed };
}

test('DTO exposes exactly the eight contract fields in UTC and hides internal columns', () => {
  assert.deepEqual(toTicketDto(ticketRow), {
    ticketId: ticketRow.ticket_id, sessionId: input.sessionId, patientId: input.patientId,
    number: 5, status: 'WAITING', lastCalledAt: null,
    createdAt: '2026-11-04T01:00:00.000Z', updatedAt: '2026-11-04T01:00:00.000Z',
  });
});

test('OPEN session: lock, check, allocate, insert and ISSUED event share one transaction client', async () => {
  const { service, calls, isCommitted } = setup();
  const result = await service.issue(rep, input);
  assert.equal(result.status, 'WAITING');
  assert.equal(result.number, 5);
  assert.ok(isCommitted());
  assert.deepEqual(calls.map(([step]) => step), ['access', 'key', 'begin', 'lock', 'key', 'active', 'allocate', 'insert', 'event']);
  assert.deepEqual(calls.filter(([step]) => step === 'key').map(([, onClient]) => onClient), [false, true],
    'retry key is read before the transaction and re-read inside it after the session lock');
  assert.deepEqual(calls.find(([step]) => step === 'begin'), ['begin', true], 'transaction must use the shared pool');
  assert.ok(calls.filter(([step]) => ['lock', 'active', 'allocate', 'insert', 'event'].includes(step))
    .every(([, onClient]) => onClient === true), 'every write step must use the transaction client');
  const [, , values] = calls.find(([step]) => step === 'insert');
  assert.deepEqual(values, { ...input, issuedByUserId: rep.userId, number: 5 });
  const [, , event] = calls.find(([step]) => step === 'event');
  assert.deepEqual(event, { ticketId: ticketRow.ticket_id, actorUserId: rep.userId,
    action: 'ISSUED', fromStatus: null, toStatus: 'WAITING' });
});

test('missing or malformed actor is 401 before any access check or DB call', async () => {
  for (const actor of [undefined, null, {}, { ...rep, userId: 'not-a-uuid' }]) {
    const { service, calls } = setup();
    await assert.rejects(service.issue(actor, input), matchesError(401, 'UNAUTHENTICATED'));
    assert.deepEqual(calls, []);
  }
});

test('STAFF and unknown roles cannot issue tickets', async () => {
  for (const actor of [staff, { ...rep, role: 'ADMIN' }]) {
    const { service, calls } = setup();
    await assert.rejects(service.issue(actor, input), matchesError(403, 'FORBIDDEN'));
    assert.deepEqual(calls, []);
  }
});

test('invalid bodies are 400 and never reach the DB', async () => {
  const bodies = [undefined, null, [], 'text',
    { patientId: input.patientId, sessionId: input.sessionId },
    { ...input, issuedByUserId: rep.userId },
    { ...input, number: 1 },
    { ...input, patientId: 'P001' },
    { ...input, requestId: 123 },
  ];
  for (const body of bodies) {
    const { service, calls } = setup();
    await assert.rejects(service.issue(rep, body), matchesError(400, 'VALIDATION_ERROR'));
    assert.deepEqual(calls, []);
  }
});

test('upper-case UUIDs are normalised before access check and insert', async () => {
  const { service, calls } = setup();
  const upper = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value.toUpperCase()]));
  await service.issue(rep, upper);
  const [, , values] = calls.find(([step]) => step === 'insert');
  assert.deepEqual({ patientId: values.patientId, sessionId: values.sessionId, requestId: values.requestId }, input);
});

test('no PatientAccess is 403 FORBIDDEN and no transaction starts', async () => {
  const { service, calls } = setup({ access: async () => {
    throw Object.assign(new Error('Bạn không có quyền với hồ sơ này.'), { statusCode: 403, code: 'FORBIDDEN' });
  } });
  await assert.rejects(service.issue(rep, input), matchesError(403, 'FORBIDDEN'));
  assert.deepEqual(calls.map(([step]) => step), ['access']);
});

test('unknown session is 404; nothing is allocated or inserted', async () => {
  const { service, calls, isCommitted } = setup({ session: null });
  await assert.rejects(service.issue(rep, input), matchesError(404, 'NOT_FOUND'));
  assert.equal(isCommitted(), false);
  assert.deepEqual(calls.map(([step]) => step), ['access', 'key', 'begin', 'lock']);
});

test('STOPPED and CLOSED sessions are 409 and issue nothing', async () => {
  for (const status of ['STOPPED', 'CLOSED']) {
    const { service, calls, isCommitted } = setup({ session: { session_id: input.sessionId, status, last_issued_number: 4 } });
    await assert.rejects(service.issue(rep, input), matchesError(409, SESSION_NOT_OPEN_CODE));
    assert.equal(isCommitted(), false);
    assert.equal(calls.some(([step]) => ['allocate', 'insert', 'event'].includes(step)), false);
  }
});

test('patient with an active ticket gets 409 ACTIVE_TICKET_EXISTS with that ticketId', async () => {
  const { service, calls } = setup({ active: { ...ticketRow, status: 'CALLED' } });
  await assert.rejects(service.issue(rep, input), (error) => error.statusCode === 409
    && error.code === 'ACTIVE_TICKET_EXISTS' && error.details.ticketId === ticketRow.ticket_id);
  assert.equal(calls.some(([step]) => ['allocate', 'insert', 'event'].includes(step)), false);
});

test('event helper failure propagates so the whole transaction rolls back', async () => {
  const original = new Error('event insert failed');
  const { service, isCommitted } = setup({ eventError: original });
  await assert.rejects(service.issue(rep, input), (error) => error === original);
  assert.equal(isCommitted(), false);
});

// ---------- WBS 2.7: retry with the same requestId ----------
const storedRow = (fields = {}) => ({ ...ticketRow, status: 'CANCELLED', number: 3, ...fields });

test('2.7 same key + same patient/session replays the stored ticket in its current state, no transaction', async () => {
  const { service, calls, isCommitted } = setup({ byKey: (onClient) => (onClient ? null : storedRow()) });
  const result = await service.issueWithStatus(rep, input);
  assert.equal(result.replayed, true);
  assert.equal(result.ticket.ticketId, ticketRow.ticket_id);
  assert.equal(result.ticket.status, 'CANCELLED');
  assert.equal(result.ticket.number, 3);
  assert.deepEqual(calls.map(([step]) => step), ['access', 'key']);
  assert.equal(isCommitted(), false);
  const [, , uid, rid] = calls.find(([step]) => step === 'key');
  assert.deepEqual([uid, rid], [rep.userId, input.requestId], 'key is (issued_by_user_id from login, requestId)');
});

test('2.7 issue() keeps returning the Ticket DTO for existing callers, new or replayed', async () => {
  assert.equal((await setup().service.issue(rep, input)).status, 'WAITING');
  assert.equal((await setup({ byKey: () => storedRow() }).service.issue(rep, input)).status, 'CANCELLED');
  assert.equal((await setup().service.issueWithStatus(rep, input)).replayed, false);
});

test('2.7 same key with a different patient or session → 409 IDEMPOTENCY_CONFLICT, nothing written', async () => {
  for (const other of [{ patient_id: '10000000-0000-4000-8000-000000000009' }, { session_id: '20000000-0000-4000-8000-000000000009' }]) {
    const { service, calls } = setup({ byKey: () => storedRow(other) });
    await assert.rejects(service.issueWithStatus(rep, input), matchesError(409, 'IDEMPOTENCY_CONFLICT'));
    assert.equal(calls.some(([step]) => ['begin', 'insert', 'event'].includes(step)), false);
  }
});

test('2.7 access is checked before the key lookup: a lost access is 403 and the stored ticket is never read', async () => {
  const { service, calls } = setup({ byKey: () => storedRow(),
    access: async () => { throw Object.assign(new Error('no'), { statusCode: 403, code: 'FORBIDDEN' }); } });
  await assert.rejects(service.issueWithStatus(rep, input), matchesError(403, 'FORBIDDEN'));
  assert.deepEqual(calls.map(([step]) => step), ['access']);
});

test('2.7 replay is answered before the OPEN check (closed session still replays)', async () => {
  const { service, calls } = setup({ session: { session_id: input.sessionId, status: 'CLOSED', last_issued_number: 9 },
    byKey: () => storedRow({ status: 'COMPLETED' }) });
  assert.equal((await service.issueWithStatus(rep, input)).ticket.status, 'COMPLETED');
  assert.equal(calls.some(([step]) => step === 'lock'), false);
});

test('2.7 concurrent retry that committed while we waited for the session lock is replayed, no second ticket', async () => {
  const { service, calls } = setup({ byKey: (onClient) => (onClient ? storedRow({ status: 'WAITING' }) : null) });
  const result = await service.issueWithStatus(rep, input);
  assert.equal(result.replayed, true);
  assert.equal(calls.some(([step]) => ['active', 'allocate', 'insert', 'event'].includes(step)), false);
});

test('2.7 unique violation on the retry key rolls back, re-reads the winner and replays (never 500)', async () => {
  const dup = Object.assign(new Error('dup'), { code: '23505', constraint: 'uq_tickets_request' });
  const { service, isCommitted } = setup({ insertError: dup, byKey: (onClient, n) => (n === 2 ? storedRow({ status: 'WAITING' }) : null) });
  const result = await service.issueWithStatus(rep, input);
  assert.equal(result.replayed, true);
  assert.equal(isCommitted(), false);

  const conflict = setup({ insertError: dup, byKey: (onClient, n) => (n === 2 ? storedRow({ patient_id: '10000000-0000-4000-8000-000000000009' }) : null) });
  await assert.rejects(conflict.service.issueWithStatus(rep, input), matchesError(409, 'IDEMPOTENCY_CONFLICT'));
});

test('unrelated unique/FK/connection errors are not disguised as business conflicts', async () => {
  for (const fields of [{ code: '23505', constraint: 'uq_tickets_session_number' }, { code: '23503' }, { code: 'ECONNRESET' }]) {
    const original = Object.assign(new Error('DB detail'), fields);
    const { service } = setup({ insertError: original });
    await assert.rejects(service.issue(rep, input), (error) => error === original);
  }
});

test('service refuses to start without the shared transaction/event/access dependencies', () => {
  const base = { db: {}, withTransaction: async () => {}, createRepository: () => ({}),
    patientAccess: { assertCanAccessPatient: async () => {} }, appendTicketEvent: async () => {} };
  for (const missing of ['withTransaction', 'createRepository', 'appendTicketEvent', 'patientAccess']) {
    assert.throws(() => createTicketIssueService({ ...base, [missing]: undefined }), TypeError);
  }
});
