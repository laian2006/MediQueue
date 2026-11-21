import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getLifecycleTransition,
  QueueRuleError,
  TICKET_STATUS,
} from '../queue.rules.js';

// Kỳ vọng được khai báo độc lập với cấu hình trong mã nghiệp vụ.
const cases = [
  ['recall', 'CALLED', 'CALLED', 'RECALLED', true],
  ['start', 'CALLED', 'REGISTERING', 'STARTED', false],
  ['complete', 'REGISTERING', 'COMPLETED', 'COMPLETED', false],
];

for (const [
  action,
  source,
  target,
  eventAction,
  refreshCalledAt,
] of cases) {
  for (const status of Object.values(TICKET_STATUS)) {
    test(`${action} from ${status}`, () => {
      if (status === source) {
        assert.deepEqual(getLifecycleTransition(action, status), {
          fromStatus: source,
          toStatus: target,
          eventAction,
          refreshCalledAt,
        });

        return;
      }

      assert.throws(
        () => getLifecycleTransition(action, status),
        (error) =>
          error instanceof QueueRuleError
          && error.code === 'INVALID_STATE',
      );
    });
  }
}

test('Unknown lifecycle actions are rejected', () => {
  assert.throws(
    () => getLifecycleTransition('unknown', 'CALLED'),
    TypeError,
  );
});

test('Unknown ticket states are rejected', () => {
  assert.throws(
    () => getLifecycleTransition('recall', 'UNKNOWN'),
    (error) =>
      error instanceof QueueRuleError
      && error.code === 'INVALID_STATE',
  );
});