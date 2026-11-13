import assert from 'node:assert/strict';
import test from 'node:test';
import { createTicketQueryService } from '../ticket-query.service.js';
import { toTicketView } from '../ticket.dto.js';

const rep = { userId: '00000000-0000-4000-8000-000000000002', role: 'REPRESENTATIVE' };
const staff = { userId: '00000000-0000-4000-8000-000000000001', role: 'STAFF' };
const ids = {
  ticket: '40000000-0000-4000-8000-000000000001',
  patient: '10000000-0000-4000-8000-000000000001',
  session: '20000000-0000-4000-8000-000000000001',
};
const row = (fields = {}) => ({
  ticket_id: ids.ticket, session_id: ids.session, patient_id: ids.patient, number: 7, status: 'WAITING',
  last_called_at: null, created_at: new Date('2026-11-09T01:00:00Z'), updated_at: new Date('2026-11-09T01:00:00Z'),
  waiting_ahead: 2, ...fields,
});
const forbidden = () => Object.assign(new Error('Bạn không có quyền với hồ sơ này.'), { statusCode: 403, code: 'FORBIDDEN' });
const matchesError = (statusCode, code) => (error) => error.statusCode === statusCode && error.code === code;

function setup({ byId = row(), active = row(), access = async () => {} } = {}) {
  const calls = [];
  const createRepository = () => ({
    findViewById: async (id) => { calls.push(['byId', id]); return byId; },
    findActiveView: async (sid, pid) => { calls.push(['active', sid, pid]); return active; },
  });
  const patientAccess = { assertCanAccessPatient: async (actor, patientId) => {
    calls.push(['access', patientId]);
    return access(actor, patientId);
  } };
  return { service: createTicketQueryService({ db: {}, createRepository, patientAccess }), calls };
}

test('TicketView: waitingAhead only for WAITING, null for every other status', () => {
  assert.deepEqual(Object.keys(toTicketView(row())), ['ticket', 'waitingAhead']);
  assert.equal(toTicketView(row()).waitingAhead, 2);
  assert.equal(toTicketView(row({ waiting_ahead: 0 })).waitingAhead, 0);
  for (const status of ['CALLED', 'REGISTERING', 'COMPLETED', 'CANCELLED', 'NO_SHOW']) {
    assert.equal(toTicketView(row({ status, waiting_ahead: 5 })).waitingAhead, null, status);
  }
  assert.equal('waiting_ahead' in toTicketView(row()).ticket, false);
});

test('getById: authorised representative gets the view; access is checked on the ticket patient', async () => {
  const { service, calls } = setup();
  const view = await service.getById(rep, ids.ticket.toUpperCase());
  assert.equal(view.ticket.ticketId, ids.ticket);
  assert.equal(view.waitingAhead, 2);
  assert.deepEqual(calls, [['byId', ids.ticket], ['access', ids.patient]]);
});

test('getById: no access is 403 and returns nothing; unknown id is 404; bad id is 400 without DB', async () => {
  const denied = setup({ access: async () => { throw forbidden(); } });
  await assert.rejects(denied.service.getById(rep, ids.ticket), matchesError(403, 'FORBIDDEN'));

  const missing = setup({ byId: null });
  await assert.rejects(missing.service.getById(rep, ids.ticket), matchesError(404, 'NOT_FOUND'));
  assert.deepEqual(missing.calls, [['byId', ids.ticket]]);

  for (const bad of [undefined, '', 'active', '123', `${ids.ticket}x`]) {
    const { service, calls } = setup();
    await assert.rejects(service.getById(rep, bad), matchesError(400, 'VALIDATION_ERROR'));
    assert.deepEqual(calls, []);
  }
});

test('getActive: access is checked BEFORE the ticket query; outsider never reaches the DB', async () => {
  const { service, calls } = setup({ access: async () => { throw forbidden(); } });
  await assert.rejects(service.getActive(rep, { patientId: ids.patient, sessionId: ids.session }), matchesError(403, 'FORBIDDEN'));
  assert.deepEqual(calls, [['access', ids.patient]]);
});

test('getActive: returns the view, or null when the patient has no active ticket', async () => {
  const found = setup();
  assert.equal((await found.service.getActive(rep, { patientId: ids.patient, sessionId: ids.session })).ticket.number, 7);
  assert.deepEqual(found.calls, [['access', ids.patient], ['active', ids.session, ids.patient]]);
  const none = setup({ active: null });
  assert.equal(await none.service.getActive(rep, { sessionId: ids.session, patientId: ids.patient }), null);
});

test('getActive: missing, extra, repeated or malformed parameters are 400 without DB', async () => {
  const queries = [undefined, {}, { patientId: ids.patient },
    { patientId: ids.patient, sessionId: ids.session, userId: rep.userId },
    { patientId: [ids.patient, ids.patient], sessionId: ids.session },
    { patientId: 'P001', sessionId: ids.session }];
  for (const query of queries) {
    const { service, calls } = setup();
    await assert.rejects(service.getActive(rep, query), matchesError(400, 'VALIDATION_ERROR'));
    assert.deepEqual(calls, []);
  }
});

test('STAFF and unauthenticated actors are rejected before any read', async () => {
  for (const [actor, status, code] of [[staff, 403, 'FORBIDDEN'], [undefined, 401, 'UNAUTHENTICATED'],
    [{ role: 'REPRESENTATIVE' }, 401, 'UNAUTHENTICATED']]) {
    const { service, calls } = setup();
    await assert.rejects(service.getById(actor, ids.ticket), matchesError(status, code));
    await assert.rejects(service.getActive(actor, { patientId: ids.patient, sessionId: ids.session }), matchesError(status, code));
    assert.deepEqual(calls, []);
  }
});

test('unexpected access-service errors are not disguised as 403', async () => {
  const original = new Error('connection lost');
  const { service } = setup({ access: async () => { throw original; } });
  await assert.rejects(service.getById(rep, ids.ticket), (error) => error === original);
});
