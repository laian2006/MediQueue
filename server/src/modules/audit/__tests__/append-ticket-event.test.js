import test from 'node:test';
import assert from 'node:assert/strict';
import { appendTicketEvent } from '../append-ticket-event.js';
import { withTransaction } from '../../../shared/db/transaction.js';

const event = {
  ticketId: '30000000-0000-4000-8000-000000000001',
  actorUserId: '00000000-0000-4000-8000-000000000002',
  action: 'ISSUED', fromStatus: null, toStatus: 'WAITING',
};

function harness({ failEvent = false, failRollback = false } = {}) {
  const queries = [];
  const released = [];
  let connections = 0;
  const failure = new Error('event insert failed');
  const client = {
    async query(sql, values) {
      queries.push({ sql: sql.trim(), values });
      if (sql.includes('INSERT INTO ticket_events') && failEvent) throw failure;
      if (sql === 'ROLLBACK' && failRollback) throw new Error('connection lost');
      return { rows: [{ event_id: 'event-result' }] };
    },
    release: (error) => released.push(error),
  };
  return { queries, released, failure, client, pool: { connect: async () => { connections++; return client; } }, get connections() { return connections; } };
}

test('business write and event share one client; helper executes only its parameterized INSERT', async () => {
  const h = harness();
  const result = await withTransaction(h.pool, async (transaction) => {
    assert.equal(transaction, h.client);
    await transaction.query('UPDATE tickets SET status = $1 WHERE ticket_id = $2', ['WAITING', event.ticketId]);
    return appendTicketEvent(transaction, event);
  });
  assert.equal(h.connections, 1);
  assert.equal(result.event_id, 'event-result');
  assert.deepEqual(h.queries.map((q) => q.sql.split(/\s/)[0]), ['BEGIN', 'UPDATE', 'INSERT', 'COMMIT']);
  assert.deepEqual(h.queries[2].values, [event.ticketId, event.actorUserId, 'ISSUED', null, 'WAITING']);
  assert.deepEqual(h.released, [undefined]);
});

test('event failure propagates and rolls back the whole business operation', async () => {
  const h = harness({ failEvent: true });
  await assert.rejects(withTransaction(h.pool, async (transaction) => {
    await transaction.query('UPDATE tickets SET status = $1', ['WAITING']);
    await appendTicketEvent(transaction, event);
  }), (error) => error === h.failure);
  assert.deepEqual(h.queries.map((q) => q.sql.split(/\s/)[0]), ['BEGIN', 'UPDATE', 'INSERT', 'ROLLBACK']);
  assert.equal(h.released.length, 1);
});

test('rollback failure discards connection and preserves original error', async () => {
  const h = harness({ failEvent: true, failRollback: true });
  await assert.rejects(withTransaction(h.pool, (tx) => appendTicketEvent(tx, event)), (e) => e === h.failure);
  assert.equal(h.released[0].message, 'connection lost');
});

test('reject malformed event before any SQL; recall keeps CALLED as before/after', async () => {
  const h = harness();
  for (const override of [{ ticketId: 'bad' }, { actorUserId: 'bad' }, { action: 'OTHER' },
    { toStatus: 'BAD' }, { fromStatus: 'WAITING' }, { action: 'CALLED', fromStatus: null }]) {
    await assert.rejects(appendTicketEvent(h.client, { ...event, ...override }), TypeError);
  }
  assert.equal(h.queries.length, 0);
  await appendTicketEvent(h.client, { ...event, action: 'RECALLED', fromStatus: 'CALLED', toStatus: 'CALLED' });
  assert.deepEqual(h.queries[0].values.slice(2), ['RECALLED', 'CALLED', 'CALLED']);
});
