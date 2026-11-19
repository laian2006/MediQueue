const TICKET_COLUMNS = `
  ticket_id, session_id, patient_id, number, status, last_called_at, created_at, updated_at
`;

// waiting_ahead: WAITING tickets of the same session with a smaller number; null unless WAITING.
// CANCELLED/NO_SHOW/COMPLETED and CALLED/REGISTERING are never counted.
const VIEW_SELECT = `
  SELECT t.ticket_id, t.session_id, t.patient_id, t.number, t.status,
         t.last_called_at, t.created_at, t.updated_at,
         CASE WHEN t.status = 'WAITING' THEN (
           SELECT count(*)::int FROM tickets w
           WHERE w.session_id = t.session_id AND w.status = 'WAITING' AND w.number < t.number
         ) END AS waiting_ahead
  FROM tickets t
`;

/**
 * `db` is either the shared pool or the client of an open transaction.
 * Issue steps must all run on the SAME transaction client (lock, counter, insert, event).
 */
export function createTicketRepository(db) {
  if (typeof db?.query !== 'function') {
    throw new TypeError('A shared PostgreSQL pool/query interface is required.');
  }

  return {
    // Lock order v1.0: queue_sessions row first, tickets afterwards.
    async lockSession(sessionId) {
      const result = await db.query(`
        SELECT session_id, status, last_issued_number
        FROM queue_sessions
        WHERE session_id = $1
        FOR UPDATE
      `, [sessionId]);
      return result.rows[0] ?? null;
    },

    // WBS 2.7: retry key over the whole ticket history (uq_tickets_request).
    async findByRequestKey(issuedByUserId, requestId) {
      const result = await db.query(`
        SELECT ${TICKET_COLUMNS}
        FROM tickets
        WHERE issued_by_user_id = $1 AND request_id = $2
      `, [issuedByUserId, requestId]);
      return result.rows[0] ?? null;
    },

    async findActiveForPatient(sessionId, patientId) {
      const result = await db.query(`
        SELECT ${TICKET_COLUMNS}
        FROM tickets
        WHERE session_id = $1 AND patient_id = $2
          AND status IN ('WAITING', 'CALLED', 'REGISTERING')
      `, [sessionId, patientId]);
      return result.rows[0] ?? null;
    },

    // Caller must already hold the session row lock. Returns null if the session is not OPEN.
    async allocateNumber(sessionId) {
      const result = await db.query(`
        UPDATE queue_sessions
        SET last_issued_number = last_issued_number + 1, updated_at = CURRENT_TIMESTAMP
        WHERE session_id = $1 AND status = 'OPEN'
        RETURNING last_issued_number
      `, [sessionId]);
      return result.rows[0]?.last_issued_number ?? null;
    },

    // Reads (WBS 1.8): ticket and waitingAhead come from ONE statement, so they share a snapshot.
    async findViewById(ticketId) {
      const result = await db.query(`${VIEW_SELECT} WHERE t.ticket_id = $1`, [ticketId]);
      return result.rows[0] ?? null;
    },

    async findActiveView(sessionId, patientId) {
      const result = await db.query(`${VIEW_SELECT}
        WHERE t.session_id = $1 AND t.patient_id = $2
          AND t.status IN ('WAITING', 'CALLED', 'REGISTERING')`, [sessionId, patientId]);
      return result.rows[0] ?? null;
    },

    async findTicketLocation(ticketId) {
      const result = await db.query('SELECT session_id, patient_id FROM tickets WHERE ticket_id = $1', [ticketId]);
      return result.rows[0] ?? null;
    },

    async cancelWaiting(ticketId, sessionId, patientId) {
      const result = await db.query(`
        UPDATE tickets
        SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
        WHERE ticket_id = $1 AND session_id = $2 AND patient_id = $3 AND status = 'WAITING'
        RETURNING ${TICKET_COLUMNS}
      `, [ticketId, sessionId, patientId]);
      return result.rows[0] ?? null;
    },

    async insertWaiting({ sessionId, patientId, issuedByUserId, requestId, number }) {
      const result = await db.query(`
        INSERT INTO tickets (session_id, patient_id, issued_by_user_id, request_id, number)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING ${TICKET_COLUMNS}
      `, [sessionId, patientId, issuedByUserId, requestId, number]);
      return result.rows[0];
    },
  };
}
