const SESSION_COLUMNS = `
  session_id, status, last_issued_number, opened_at, stopped_at, closed_at
`;

export function createSessionRepository(db) {
  if (typeof db?.query !== 'function') {
    throw new TypeError('A shared PostgreSQL pool/query interface is required.');
  }

  return {
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
