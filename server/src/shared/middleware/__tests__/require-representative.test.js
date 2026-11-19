import assert from 'node:assert/strict';
import test from 'node:test';
import { requireRepresentative } from '../require-representative.js';

function run(req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body, nextCalled: false }); },
    };
    requireRepresentative(req, res, () => resolve({ status: 200, nextCalled: true }));
  });
}

test('WBS 2.4 requireRepresentative: no req.user → 401 UNAUTHENTICATED', async () => {
  const result = await run({});
  assert.equal(result.status, 401);
  assert.equal(result.body.error.code, 'UNAUTHENTICATED');
  assert.equal(result.nextCalled, false);
});

test('WBS 2.4 requireRepresentative: STAFF → 403 FORBIDDEN, next is not called', async () => {
  const result = await run({ user: { userId: 'x', role: 'STAFF' } });
  assert.equal(result.status, 403);
  assert.equal(result.body.error.code, 'FORBIDDEN');
  assert.equal(result.nextCalled, false);
});

test('WBS 2.4 requireRepresentative: unknown role → 403', async () => {
  const result = await run({ user: { userId: 'x', role: 'ADMIN' } });
  assert.equal(result.status, 403);
});

test('WBS 2.4 requireRepresentative: REPRESENTATIVE passes to next()', async () => {
  const result = await run({ user: { userId: 'x', role: 'REPRESENTATIVE' } });
  assert.equal(result.nextCalled, true);
});

test('WBS 2.4 requireRepresentative: role sent by the client (header/body/query) is ignored', async () => {
  const result = await run({
    user: { userId: 'x', role: 'STAFF' },
    headers: { 'x-role': 'REPRESENTATIVE' },
    body: { role: 'REPRESENTATIVE' },
    query: { role: 'REPRESENTATIVE' },
  });
  assert.equal(result.status, 403);
});
