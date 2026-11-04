const TICKET_COLUMNS = `
  ticket_id, session_id, patient_id, number, status, last_called_at, created_at, updated_at
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
