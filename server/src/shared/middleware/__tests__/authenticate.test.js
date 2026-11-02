import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthenticate } from '../authenticate.js';
import { requireStaff } from '../require-staff.js';

const ID = '00000000-0000-4000-8000-000000000002';
const now = new Date('2026-11-02T01:00:00.000Z');
const future = '2026-11-02T09:00:00.000Z';
const dbRow = { user_id: ID, display_name: 'A', role: 'REPRESENTATIVE', username: 'x', password_hash: 'h' };

function run(middleware, req) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ res: this, body: b, nextCalled: false, req }); } };
    const maybe = middleware(req, res, (error) => resolve({ res, nextCalled: true, error, req }));
    if (maybe?.catch) maybe.catch((e) => resolve({ res, nextCalled: true, error: e, req }));
  });
}
const session = (data, destroyed = []) => ({ ...data, destroy(cb) { destroyed.push(true); cb(); } });
const makeAuth = (findById = async () => dbRow) => createAuthenticate({ userRepository: { findById }, now: () => now });

test('factory requires a repository', () => {
  assert.throws(() => createAuthenticate({}), TypeError);
});

test('no session / no userId / malformed userId → 401 without touching the DB', async () => {
  const auth = makeAuth(async () => { throw new Error('must not be called'); });
  for (const req of [{}, { session: {} }, { session: { userId: 42 } }, { session: { userId: 'not-a-uuid', expiresAt: future } }]) {
    const out = await run(auth, req);
    assert.equal(out.res.statusCode, 401);
    assert.equal(out.body.error.code, 'UNAUTHENTICATED');
  }
});

test('user identity comes from the session + DB, never from body/query/headers', async () => {
  const req = { session: session({ userId: ID, expiresAt: future }), body: { userId: 'x', role: 'STAFF' },
    query: { role: 'STAFF' }, headers: { 'x-user-role': 'STAFF' } };
  const out = await run(makeAuth(), req);
  assert.equal(out.nextCalled, true);
  assert.deepEqual(req.user, { userId: ID, displayName: 'A', role: 'REPRESENTATIVE' });
});

test('absolute expiry is enforced and the session is destroyed', async () => {
  const destroyed = [];
  for (const expiresAt of ['2026-11-02T01:00:00.000Z', '2026-11-01T00:00:00.000Z', undefined, 'garbage']) {
    const out = await run(makeAuth(), { session: session({ userId: ID, expiresAt }, destroyed) });
    assert.equal(out.res.statusCode, 401);
    assert.equal(out.nextCalled, false);
  }
  assert.equal(destroyed.length, 4);
});

test('a user deleted after login is rejected', async () => {
  const destroyed = [];
  const out = await run(makeAuth(async () => null), { session: session({ userId: ID, expiresAt: future }, destroyed) });
  assert.equal(out.res.statusCode, 401);
  assert.equal(destroyed.length, 1);
});

test('database failures go to the shared error handler, not the client', async () => {
  const original = new Error('DB detail');
  const out = await run(makeAuth(async () => { throw original; }), { session: session({ userId: ID, expiresAt: future }) });
  assert.equal(out.nextCalled, true);
  assert.equal(out.error, original);
});

test('requireStaff: STAFF passes, REPRESENTATIVE 403, missing user 401', async () => {
  assert.equal((await run(requireStaff, { user: { role: 'STAFF' } })).nextCalled, true);
  const rep = await run(requireStaff, { user: { role: 'REPRESENTATIVE' } });
  assert.equal(rep.res.statusCode, 403);
  assert.equal(rep.body.error.code, 'FORBIDDEN');
  const none = await run(requireStaff, {});
  assert.equal(none.res.statusCode, 401);
  assert.equal((await run(requireStaff, { user: { role: 'ADMIN' } })).res.statusCode, 403);
});
