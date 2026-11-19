const SESSION_COLUMNS = `
  session_id, status, last_issued_number, opened_at, stopped_at, closed_at
`;

export function createSessionRepository(db) {
  if (typeof db?.query !== 'function') {
    throw new TypeError('A shared PostgreSQL pool/query interface is required.');
  }

  return {
    async lockById(sessionId) {
      const result = await db.query(`
        SELECT ${SESSION_COLUMNS} FROM queue_sessions
        WHERE session_id = $1 FOR UPDATE
      `, [sessionId]);
      return result.rows[0] ?? null;
    },

    async hasActiveTickets(sessionId) {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT 1 FROM tickets WHERE session_id = $1
          AND status IN ('WAITING', 'CALLED', 'REGISTERING')
        ) AS active
      `, [sessionId]);
      return result.rows[0].active;
    },

    async stop(sessionId, actorId) {
      const result = await db.query(`
        UPDATE queue_sessions SET status = 'STOPPED', stopped_by = $2,
          stopped_at = GREATEST(opened_at, statement_timestamp()),
          updated_at = GREATEST(updated_at, statement_timestamp())
        WHERE session_id = $1 RETURNING ${SESSION_COLUMNS}
      `, [sessionId, actorId]);
      return result.rows[0];
    },

    async close(sessionId, actorId) {
      const result = await db.query(`
        UPDATE queue_sessions SET status = 'CLOSED', closed_by = $2,
          closed_at = GREATEST(stopped_at, statement_timestamp()),
          updated_at = GREATEST(updated_at, statement_timestamp())
        WHERE session_id = $1 RETURNING ${SESSION_COLUMNS}
      `, [sessionId, actorId]);
      return result.rows[0];
    },

    async findCurrent() {
      const result = await db.query(`
        SELECT ${SESSION_COLUMNS}
        FROM queue_sessions
        WHERE status IN ('OPEN', 'STOPPED')
      `);
      return result.rows[0] ?? null;
    },

    async insertOpen(openedBy) {
      // One atomic statement. The partial unique index arbitrates concurrent opens.
      const result = await db.query(`
        INSERT INTO queue_sessions (opened_by)
        VALUES ($1)
        RETURNING ${SESSION_COLUMNS}
      `, [openedBy]);
      return result.rows[0];
    },
  };
}
