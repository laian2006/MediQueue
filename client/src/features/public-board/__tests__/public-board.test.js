import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicBoardApi } from '../public-board.api.js';
import { pollPublicBoard } from '../public-board.polling.js';

const board = { currentTicket: { number: 2, status: 'CALLED' }, waitingNumbers: [3, 8], updatedAt: '2026-11-05T12:00:00.000Z' };
const settle = () => new Promise(setImmediate);
test('board uses the public endpoint, preserves cancellation and validates successful responses', async () => {
  const controller = new AbortController();
  const api = createPublicBoardApi({ get: async (path, options) => {
    assert.equal(path, '/public/board');
    assert.equal(options.signal, controller.signal);
    return { data: board };
  } });
  assert.deepEqual(await api.getBoard({ signal: controller.signal }), board);
  for (const data of [null, { ...board, currentTicket: { number: 2, status: 'COMPLETED' } },
    { ...board, waitingNumbers: [-1] }, { ...board, updatedAt: 'bad' }]) {
    await assert.rejects(createPublicBoardApi({ get: async () => ({ data }) }).getBoard());
  }
});
test('slow request never overlaps; next successful snapshot replaces old numbers', async () => {
  let finish;
  let calls = 0;
  let next;
  const seen = [];
  const stop = pollPublicBoard({
    load: () => { calls++; return new Promise((resolve) => { finish = resolve; }); },
    onData: (data) => seen.push(data), onError: assert.fail,
    schedule: (callback, delay) => { assert.equal(delay, 3000); next = callback; return 1; }, cancel: () => {},
  });
  assert.equal(calls, 1);
  assert.equal(next, undefined);
  finish(board);
  await settle();
  next();
  assert.equal(calls, 2);
  finish({ ...board, currentTicket: { number: 3, status: 'CALLED' }, waitingNumbers: [8] });
  await settle();
  assert.deepEqual(seen.map((data) => data.currentTicket.number), [2, 3]);
  stop();
});
test('failure reports an error, retries and recovers without synthesizing data', async () => {
  let calls = 0;
  let retry;
  const data = [];
  const errors = [];
  const stop = pollPublicBoard({
    load: async () => { if (++calls === 1) throw new TypeError('offline'); return board; },
    onData: (value) => data.push(value), onError: (error) => errors.push(error),
    schedule: (callback) => { retry = callback; return 1; }, cancel: () => {},
  });
  await settle();
  assert.equal(errors.length, 1);
  assert.equal(data.length, 0);
  retry();
  await settle();
  assert.deepEqual(data, [board]);
  stop();
});
test('cleanup aborts pending fetch and ignores late completion', async () => {
  let finish;
  let signal;
  let scheduled = 0;
  const stop = pollPublicBoard({
    load: (options) => { signal = options.signal; return new Promise((resolve) => { finish = resolve; }); },
    onData: assert.fail, onError: assert.fail,
    schedule: () => { scheduled++; }, cancel: () => {},
  });
  stop();
  assert.equal(signal.aborted, true);
  finish(board);
  await settle();
  assert.equal(scheduled, 0);
});
