import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword } from '../password.js';

test('hash is salted, never contains the plain password, and verifies', async () => {
  const a = await hashPassword('Demo@12345');
  const b = await hashPassword('Demo@12345');
  assert.notEqual(a, b);
  assert.ok(a.startsWith('scrypt$'));
  assert.ok(!a.includes('Demo@12345'));
  assert.equal(await verifyPassword('Demo@12345', a), true);
  assert.equal(await verifyPassword('Demo@12346', a), false);
  assert.equal(await verifyPassword('', a), false);
});

test('malformed or unsupported stored hashes never verify and never throw', async () => {
  for (const stored of [undefined, null, '', 'plain', 'bcrypt$x$y', 'scrypt$1$8$1$AA==$AA==',
    'scrypt$16384$8$1$$', 'scrypt$16384$8$1$AA==', 'scrypt$999999999$8$1$AA==$AA==']) {
    assert.equal(await verifyPassword('Demo@12345', stored), false);
  }
  assert.equal(await verifyPassword(undefined, await hashPassword('x')), false);
});

test('hashPassword rejects empty or non-string input', async () => {
  await assert.rejects(hashPassword(''), TypeError);
  await assert.rejects(hashPassword(undefined), TypeError);
});
