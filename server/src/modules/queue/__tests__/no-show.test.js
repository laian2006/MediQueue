import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canTransition,
  evaluateNoShowWindow,
} from '../queue.rules.js';

import { loadEnv } from '../../../shared/config/env.js';

for (const [remaining, allowed, seconds] of [
  [60000, false, 60],
  [1500, false, 2],
  [1, false, 1],
  [0.001, false, 1],
  [0, true, 0],
  [-0.001, true, 0],
  [-1000, true, 0],
]) {
  test(`No-show window with ${remaining} milliseconds remaining`, () => {
    assert.deepEqual(evaluateNoShowWindow(remaining), {
      allowed,
      remainingSeconds: seconds,
    });
  });
}

test('Invalid timing values are rejected', () => {
  for (const value of [null, undefined, '0', NaN, Infinity]) {
    assert.throws(
      () => evaluateNoShowWindow(value),
      TypeError,
    );
  }
});

test('Only CALLED can transition to NO_SHOW', () => {
  for (const status of [
    'WAITING',
    'CALLED',
    'REGISTERING',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW',
  ]) {
    assert.equal(
      canTransition(status, 'NO_SHOW'),
      status === 'CALLED',
    );
  }
});

// Chỉ dùng thông tin giả để kiểm tra bộ đọc cấu hình.
const baseEnv = {
  DATABASE_URL: 'postgresql://test:test@localhost/mediqueue_test',
  SESSION_SECRET: 'test-only-secret-'.repeat(4),
};

test('The shared timeout defaults to 60 seconds', () => {
  assert.equal(loadEnv(baseEnv).noShowTimeoutSeconds, 60);
});

test('The shared timeout accepts a configured value', () => {
  assert.equal(
    loadEnv({
      ...baseEnv,
      NO_SHOW_TIMEOUT_SECONDS: '7',
    }).noShowTimeoutSeconds,
    7,
  );
});

test('Invalid configured timeouts are rejected', () => {
  for (const value of ['0', '-1', '1.5', 'abc', '86401']) {
    assert.throws(() => loadEnv({
      ...baseEnv,
      NO_SHOW_TIMEOUT_SECONDS: value,
    }));
  }
});