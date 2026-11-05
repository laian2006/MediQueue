import test from 'node:test';
import assert from 'node:assert/strict';
import { toPublicBoardDto } from '../public-board.dto.js';
import { createPublicBoardService } from '../public-board.service.js';

const row = {
  current_ticket: { number: 12, status: 'CALLED', ticketId: 'private', displayName: 'PRIVATE NAME' },
  waiting_numbers: [13, 15], updated_at: new Date('2026-11-05T12:00:00Z'),
  patient_id: 'private', secret: 'PRIVATE SECRET',
};
test('public allowlist drops private fields even if the repository returns extras', () => {
  assert.deepEqual(toPublicBoardDto(row), {
    currentTicket: { number: 12, status: 'CALLED' }, waitingNumbers: [13, 15], updatedAt: '2026-11-05T12:00:00.000Z',
  });
  assert.doesNotMatch(JSON.stringify(toPublicBoardDto(row)), /private|PRIVATE|patient|ticketId/);
});
test('empty snapshot stays empty; registering is supported', () => {
  assert.equal(toPublicBoardDto({ ...row, current_ticket: null, waiting_numbers: [] }).currentTicket, null);
  assert.equal(toPublicBoardDto({ ...row, current_ticket: { number: 12, status: 'REGISTERING' } }).currentTicket.status, 'REGISTERING');
});
test('unexpected data and database failures never become a fake successful empty board', async () => {
  for (const override of [{ waiting_numbers: null }, { waiting_numbers: [-1] }, { current_ticket: undefined },
    { current_ticket: { number: 0, status: 'CALLED' } }, { current_ticket: { number: 1, status: 'WAITING' } },
    { updated_at: 'invalid' }]) {
    assert.throws(() => toPublicBoardDto({ ...row, ...override }));
  }
  const failure = new Error('database failed');
  const service = createPublicBoardService({ repository: { getSnapshot: async () => { throw failure; } } });
  await assert.rejects(service.getBoard(), (error) => error === failure);
});
