const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['ISSUED', 'CALLED', 'RECALLED', 'STARTED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']);
const STATUSES = new Set(['WAITING', 'CALLED', 'REGISTERING', 'COMPLETED', 'CANCELLED', 'NO_SHOW']);

/** Append only. The caller owns BEGIN/COMMIT/ROLLBACK and validates business transitions. */
export async function appendTicketEvent(transaction, { ticketId, actorUserId, action, fromStatus, toStatus }) {
  if (typeof transaction?.query !== 'function') throw new TypeError('A transaction client is required.');
  if (!UUID.test(ticketId) || !UUID.test(actorUserId) || !ACTIONS.has(action)
      || !STATUSES.has(toStatus)
      || (action === 'ISSUED' ? fromStatus !== null : !STATUSES.has(fromStatus))) {
    throw new TypeError('Invalid TicketEvent fields.');
  }
  const result = await transaction.query(`
    INSERT INTO ticket_events (ticket_id, actor_user_id, action, from_status, to_status)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING event_id, ticket_id, actor_user_id, action, from_status, to_status, occurred_at
  `, [ticketId, actorUserId, action, fromStatus, toStatus]);
  return result.rows[0];
}
