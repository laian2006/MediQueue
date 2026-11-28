import test from 'node:test';
import assert from 'node:assert/strict';
import { noShowRemainingSeconds, serverOffsetMs } from '../noShowTiming.js';

const calledAt = '2026-11-28T02:00:00.000Z';
const snapshot = (overrides = {}) => ({
  current: { status: 'CALLED', lastCalledAt: calledAt, ...overrides.current },
  noShowTimeoutSeconds: 60,
  serverOffsetMs: 0,
  ...overrides.snapshot,
});
const at = (seconds) => Date.parse(calledAt) + seconds * 1000;

test('2.17 counts down T from the last call and reaches 0 exactly at T', () => {
  assert.equal(noShowRemainingSeconds(snapshot(), at(0)), 60);
  assert.equal(noShowRemainingSeconds(snapshot(), at(59.2)), 1);
  assert.equal(noShowRemainingSeconds(snapshot(), at(60)), 0);
  assert.equal(noShowRemainingSeconds(snapshot(), at(300)), 0);
});

test('2.17 uses the server clock offset, not the browser clock', () => {
  // Trình duyệt chạy chậm 30 giây so với máy chủ: còn 30 giây chứ không phải 60.
  const slowBrowser = snapshot({ snapshot: { serverOffsetMs: 30_000 } });
  assert.equal(noShowRemainingSeconds(slowBrowser, at(0)), 30);
  // Trình duyệt chạy nhanh 2 phút: vẫn chưa đủ T theo máy chủ.
  const fastBrowser = snapshot({ snapshot: { serverOffsetMs: -120_000 } });
  assert.equal(noShowRemainingSeconds(fastBrowser, at(120)), 60);
  assert.equal(serverOffsetMs('2026-11-28T02:00:30.000Z', at(0)), 30_000);
  assert.equal(serverOffsetMs('not a date', at(0)), 0);
});

test('2.17 recall restarts T because lastCalledAt moves', () => {
  const recalled = snapshot({ current: { lastCalledAt: '2026-11-28T02:01:30.000Z' } });
  assert.equal(noShowRemainingSeconds(recalled, at(90)), 60);
});

test('2.17 no countdown without a CALLED ticket or server T', () => {
  assert.equal(noShowRemainingSeconds(null, at(0)), null);
  assert.equal(noShowRemainingSeconds({ current: null }, at(0)), null);
  assert.equal(noShowRemainingSeconds(snapshot({ current: { status: 'REGISTERING' } }), at(90)), null);
  assert.equal(noShowRemainingSeconds(snapshot({ current: { lastCalledAt: null } }), at(90)), null);
  assert.equal(noShowRemainingSeconds(snapshot({ snapshot: { noShowTimeoutSeconds: undefined } }), at(90)), null);
});
