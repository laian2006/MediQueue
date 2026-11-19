import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { createPatientAccessService } from '../patient-access.service.js';
import { createPatientRouter } from '../patient.routes.js';
import { requireRepresentative } from '../../../shared/middleware/require-representative.js';

const rep = { userId: '00000000-0000-4000-8000-000000000002', role: 'REPRESENTATIVE', displayName: 'A' };
const staff = { userId: '00000000-0000-4000-8000-000000000001', role: 'STAFF', displayName: 'S' };
const P1 = '10000000-0000-4000-8000-000000000001';
const actors = { rep, staff };

let queried = [];
const repository = {
  hasAccess: async () => false,
  listForUser: async (userId) => {
    queried.push(userId);
    return [{ patient_id: P1, code: 'P001', display_name: 'Người bệnh mô phỏng 01', secret: 'x' }];
  },
};

// authenticate giả CHỈ dùng trong test này; bản thật được kiểm tra ở tests/integration/patients.test.js.
const fakeAuthenticate = (req, res, next) => {
  const actor = actors[req.get('x-test-actor')];
  if (!actor) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'x' } });
  req.user = actor;
  return next();
};

async function start(t) {
  const app = express();
  app.use('/patients', createPatientRouter({
    patientAccessService: createPatientAccessService({ repository }),
    authenticate: fakeAuthenticate,
    requireRepresentative,
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}/patients`;
}

test('GET /patients: representative gets only the DTO fields, no-store', async (t) => {
  queried = [];
  const url = await start(t);
  const response = await fetch(url, { headers: { 'x-test-actor': 'rep' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { data: [{ patientId: P1, code: 'P001', displayName: 'Người bệnh mô phỏng 01' }] });
  assert.deepEqual(queried, [rep.userId]);
});

test('GET /patients: userId in the query string is ignored', async (t) => {
  queried = [];
  const url = await start(t);
  await fetch(`${url}?userId=${staff.userId}`, { headers: { 'x-test-actor': 'rep' } });
  assert.deepEqual(queried, [rep.userId]);
});

test('GET /patients: STAFF is 403 and never reaches the repository; no login is 401', async (t) => {
  queried = [];
  const url = await start(t);
  const forbidden = await fetch(url, { headers: { 'x-test-actor': 'staff' } });
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error.code, 'FORBIDDEN');
  const anonymous = await fetch(url);
  assert.equal(anonymous.status, 401);
  assert.deepEqual(queried, []);
});

test('createPatientRouter refuses to start without authenticate', () => {
  assert.throws(() => createPatientRouter({ patientAccessService: {} }), TypeError);
});
