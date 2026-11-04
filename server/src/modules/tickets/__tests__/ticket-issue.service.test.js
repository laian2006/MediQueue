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
  active = null, insertError, eventError, access = async () => {} } = {}) {
  const calls = [];
  const client = { query: async () => { throw new Error('repository double only'); } };
  const pool = { query: async () => { throw new Error('repository double only'); } };
  const createRepository = (db) => ({
    lockSession: async (id) => { calls.push(['lock', db === client, id]); return session; },
    findActiveForPatient: async (sid, pid) => { calls.push(['active', db === client, sid, pid]); return active; },
    allocateNumber: async (id) => { calls.push(['allocate', db === client, id]); return session.last_issued_number + 1; },
    insertWaiting: async (values) => {
      calls.push(['insert', db === client, values]);
      if (insertError) throw insertError;
      return { ...ticketRow, number: values.number };
    },
  });
  let committed = false;
  const withTransaction = async (fn) => {
    calls.push(['begin']);
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
  assert.deepEqual(calls.map(([step]) => step), ['access', 'begin', 'lock', 'active', 'allocate', 'insert', 'event']);
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
  assert.deepEqual(calls.map(([step]) => step), ['access', 'begin', 'lock']);
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

test('reused requestId of the same sender is 409 in Sprint 1 (replay arrives in 2.7)', async () => {
  const { service } = setup({ insertError: Object.assign(new Error('dup'), {
    code: '23505', constraint: 'uq_tickets_request' }) });
  await assert.rejects(service.issue(rep, input), matchesError(409, 'IDEMPOTENCY_CONFLICT'));
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
