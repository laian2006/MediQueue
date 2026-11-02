import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionService } from '../session.service.js';
import { toSessionDto } from '../session.dto.js';

const staff = { userId: '00000000-0000-4000-8000-000000000001', role: 'STAFF' };
const representative = { userId: '00000000-0000-4000-8000-000000000002', role: 'REPRESENTATIVE' };
const row = {
  session_id: '10000000-0000-4000-8000-000000000001',
  status: 'OPEN', last_issued_number: 0,
  opened_at: new Date('2026-11-02T08:00:00+07:00'), stopped_at: null, closed_at: null,
  opened_by: staff.userId, updated_at: new Date(), internal_field: 'private',
};
const matchesError = (statusCode, code) => (error) => error.statusCode === statusCode && error.code === code;

test('DTO exposes only the six API fields, UTC and explicit null times', () => {
  assert.deepEqual(toSessionDto(row), {
    sessionId: row.session_id, status: 'OPEN', lastIssuedNumber: 0,
    openedAt: '2026-11-02T01:00:00.000Z', stoppedAt: null, closedAt: null,
  });
});

test('DTO converts stopped/closed timestamps to UTC', () => {
  const result = toSessionDto({ ...row, status: 'CLOSED',
    stopped_at: '2026-11-02T09:00:00+07:00', closed_at: '2026-11-02T10:00:00+07:00' });
  assert.equal(result.stoppedAt, '2026-11-02T02:00:00.000Z');
  assert.equal(result.closedAt, '2026-11-02T03:00:00.000Z');
});

test('no current session returns null', async () => {
  const service = createSessionService({ repository: { findCurrent: async () => null } });
  assert.equal(await service.getCurrent(staff), null);
});

test('both authenticated roles may read current session', async () => {
  const service = createSessionService({ repository: { findCurrent: async () => row } });
  for (const actor of [staff, representative]) {
    assert.deepEqual(await service.getCurrent(actor), toSessionDto(row));
  }
});

test('missing/malformed actor cannot read or open, and never reaches the repository', async () => {
  const service = createSessionService({ repository: {} });
  for (const actor of [undefined, null, {}, { ...staff, userId: 'not-a-uuid' }]) {
    await assert.rejects(service.getCurrent(actor), matchesError(401, 'UNAUTHENTICATED'));
    await assert.rejects(service.open(actor), matchesError(401, 'UNAUTHENTICATED'));
  }
});

test('unknown roles are rejected before DB access', async () => {
  const service = createSessionService({ repository: {} });
  await assert.rejects(service.getCurrent({ ...staff, role: 'ADMIN' }), matchesError(403, 'FORBIDDEN'));
});

test('representative cannot open even if a route middleware is misconfigured', async () => {
  const service = createSessionService({ repository: {} });
  await assert.rejects(service.open(representative), matchesError(403, 'FORBIDDEN'));
});

test('staff opens using the trusted actor ID and gets a DTO', async () => {
  let openedBy;
  const service = createSessionService({ repository: {
    insertOpen: async (userId) => { openedBy = userId; return row; },
  } });
  assert.deepEqual(await service.open(staff), toSessionDto(row));
  assert.equal(openedBy, staff.userId);
});

test('the active-session unique violation becomes a business conflict', async () => {
  const service = createSessionService({ repository: {
    insertOpen: async () => { throw Object.assign(new Error('duplicate'), {
      code: '23505', constraint: 'uq_queue_sessions_single_active',
    }); },
  } });
  await assert.rejects(service.open(staff), matchesError(409, 'SESSION_ALREADY_ACTIVE'));
});

test('unrelated unique/FK/connection errors must not masquerade as an active session', async () => {
  for (const fields of [{ code: '23505', constraint: 'other_index' }, { code: '23503' }, { code: 'ECONNREFUSED' }]) {
    const original = Object.assign(new Error('DB detail'), fields);
    const service = createSessionService({ repository: { insertOpen: async () => { throw original; } } });
    await assert.rejects(service.open(staff), (error) => error === original);
  }
});

test('read failures propagate to the shared error handler', async () => {
  const original = new Error('DB detail');
  const service = createSessionService({ repository: { findCurrent: async () => { throw original; } } });
  await assert.rejects(service.getCurrent(staff), (error) => error === original);
});
