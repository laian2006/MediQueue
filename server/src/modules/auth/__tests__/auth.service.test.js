import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthService } from '../auth.service.js';
import { hashPassword } from '../password.js';

const row = {
  user_id: '00000000-0000-4000-8000-000000000002', username: 'rep_a',
  display_name: 'Người đại diện A', role: 'REPRESENTATIVE',
  password_hash: await hashPassword('Demo@12345'),
};
const fixedNow = new Date('2026-11-02T01:00:00.000Z');
const matches = (statusCode, code) => (error) => error.statusCode === statusCode && error.code === code;

function makeService(found = row, calls = []) {
  return createAuthService({
    repository: { findByUsername: async (u) => { calls.push(u); return found && u === found.username ? found : null; } },
    now: () => fixedNow,
  });
}

test('valid login returns the user DTO (no hash/username) and an 8h absolute expiry', async () => {
  const result = await makeService().login({ username: 'rep_a', password: 'Demo@12345' });
  assert.deepEqual(result.user, { userId: row.user_id, displayName: 'Người đại diện A', role: 'REPRESENTATIVE' });
  assert.equal(result.expiresAt.toISOString(), '2026-11-02T09:00:00.000Z');
});

test('username is trimmed before lookup', async () => {
  const calls = [];
  await makeService(row, calls).login({ username: '  rep_a ', password: 'Demo@12345' });
  assert.deepEqual(calls, ['rep_a']);
});

test('wrong password and unknown user give the identical 401', async () => {
  const service = makeService();
  const wrong = await service.login({ username: 'rep_a', password: 'sai' }).catch((e) => e);
  const unknown = await service.login({ username: 'nobody', password: 'Demo@12345' }).catch((e) => e);
  for (const error of [wrong, unknown]) assert.ok(matches(401, 'INVALID_CREDENTIALS')(error));
  assert.equal(wrong.message, unknown.message);
});

test('invalid input is a 400 and never reaches the repository', async () => {
  const service = createAuthService({ repository: {} });
  const bad = [undefined, null, 'x', [], {}, { username: 'a' }, { password: 'b' },
    { username: '', password: 'b' }, { username: '   ', password: 'b' }, { username: 'a', password: '' },
    { username: 1, password: 'b' }, { username: 'a', password: {} },
    { username: 'a'.repeat(101), password: 'b' }, { username: 'a', password: 'b'.repeat(201) },
    { username: 'a', password: 'b', role: 'STAFF' }];
  for (const input of bad) await assert.rejects(service.login(input), matches(400, 'VALIDATION_ERROR'));
});

test('repository failures propagate to the shared error handler', async () => {
  const original = new Error('DB detail');
  const service = createAuthService({ repository: { findByUsername: async () => { throw original; } } });
  await assert.rejects(service.login({ username: 'a', password: 'b' }), (error) => error === original);
});
