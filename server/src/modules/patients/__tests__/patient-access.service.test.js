import assert from 'node:assert/strict';
import test from 'node:test';
import { createPatientAccessService } from '../patient-access.service.js';

const repA = { userId: '00000000-0000-4000-8000-000000000002', role: 'REPRESENTATIVE' };
const staff = { userId: '00000000-0000-4000-8000-000000000001', role: 'STAFF' };
const P1 = '10000000-0000-4000-8000-000000000001';
const P3 = '10000000-0000-4000-8000-000000000003';
const matches = (statusCode, code) => (error) => error.statusCode === statusCode && error.code === code;
const repository = {
  hasAccess: async (userId, patientId) => userId === repA.userId && patientId === P1,
  listForUser: async (userId) => (userId === repA.userId
    ? [{ patient_id: P1, code: 'P001', display_name: 'Người bệnh mô phỏng 01', internal: 'x' }] : []),
};
const service = createPatientAccessService({ repository });

test('listPatients returns only the three DTO fields', async () => {
  assert.deepEqual(await service.listPatients(repA), [{ patientId: P1, code: 'P001', displayName: 'Người bệnh mô phỏng 01' }]);
});

test('STAFF and malformed actors cannot list or assert, and never reach the repository', async () => {
  const guarded = createPatientAccessService({ repository: {} });
  await assert.rejects(guarded.listPatients(staff), matches(403, 'FORBIDDEN'));
  await assert.rejects(guarded.assertCanAccessPatient(staff, P1), matches(403, 'FORBIDDEN'));
  for (const actor of [undefined, null, {}, { ...repA, userId: 'nope' }]) {
    await assert.rejects(guarded.listPatients(actor), matches(401, 'UNAUTHENTICATED'));
    await assert.rejects(guarded.assertCanAccessPatient(actor, P1), matches(401, 'UNAUTHENTICATED'));
    await assert.rejects(guarded.canAccessPatient(actor, P1), matches(401, 'UNAUTHENTICATED'));
  }
});

test('canAccessPatient: granted → true; other profile, staff, bad id → false', async () => {
  assert.equal(await service.canAccessPatient(repA, P1), true);
  assert.equal(await service.canAccessPatient(repA, P3), false);
  assert.equal(await service.canAccessPatient(staff, P1), false);
  const guarded = createPatientAccessService({ repository: {} });
  for (const id of [undefined, null, 5, 'abc', "' OR 1=1 --"]) assert.equal(await guarded.canAccessPatient(repA, id), false);
});

test('assertCanAccessPatient: 400 bad id, 403 outside access, resolves when granted', async () => {
  await assert.rejects(service.assertCanAccessPatient(repA, 'abc'), matches(400, 'VALIDATION_ERROR'));
  await assert.rejects(service.assertCanAccessPatient(repA, P3), matches(403, 'FORBIDDEN'));
  await service.assertCanAccessPatient(repA, P1);
});

test('repository failures propagate unchanged', async () => {
  const original = new Error('DB detail');
  const failing = createPatientAccessService({ repository: { hasAccess: async () => { throw original; } } });
  await assert.rejects(failing.assertCanAccessPatient(repA, P1), (error) => error === original);
});
