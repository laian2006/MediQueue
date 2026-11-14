import assert from 'node:assert/strict';
import test from 'node:test';
import { homeFor, isUnauthenticated, loginErrorMessage, validateLoginForm } from '../auth.logic.js';

test('each role goes to its own area; unknown role goes home', () => {
  assert.equal(homeFor('REPRESENTATIVE'), '/patient');
  assert.equal(homeFor('STAFF'), '/staff');
  assert.equal(homeFor('ADMIN'), '/');
  assert.equal(homeFor(undefined), '/');
});

test('form validation asks for both fields; the password is not trimmed', () => {
  assert.match(validateLoginForm({ username: '  ', password: 'x' }), /tên đăng nhập/);
  assert.match(validateLoginForm({ username: 'rep_a', password: '' }), /mật khẩu/);
  assert.equal(validateLoginForm({ username: 'rep_a', password: ' ' }), '');
});

test('error messages: wrong credentials, bad input, forbidden origin, network', () => {
  assert.match(loginErrorMessage({ status: 401 }), /không đúng/);
  assert.match(loginErrorMessage({ status: 400 }), /nhập đủ/);
  assert.match(loginErrorMessage({ status: 403 }), /localhost:5173/);
  assert.match(loginErrorMessage(new TypeError('fetch failed')), /kết nối/);
  assert.doesNotMatch(loginErrorMessage({ status: 401 }), /rep_a|password/i);
});

test('only 401 counts as unauthenticated', () => {
  assert.equal(isUnauthenticated({ status: 401 }), true);
  assert.equal(isUnauthenticated({ status: 403 }), false);
  assert.equal(isUnauthenticated(null), false);
});
