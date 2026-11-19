export function createPublicBoardRepository(db) {
  if (typeof db?.query !== 'function') throw new TypeError('A shared database is required.');
  return {
    async getSnapshot() {
      // One statement uses one MVCC snapshot: a call cannot appear in both lists
      // because of a state change between two independent SELECTs.
      const result = await db.query(`
        WITH active_session AS (
          SELECT session_id FROM queue_sessions WHERE status IN ('OPEN', 'STOPPED')
        )
        SELECT
          (SELECT json_build_object('number', t.number, 'status', t.status)
           FROM tickets t JOIN active_session s USING (session_id)
           WHERE t.status IN ('CALLED', 'REGISTERING')
           ORDER BY t.number LIMIT 1) AS current_ticket,
          COALESCE(
            (SELECT json_agg(t.number ORDER BY t.number)
             FROM tickets t JOIN active_session s USING (session_id)
             WHERE t.status = 'WAITING'), '[]'::json
          ) AS waiting_numbers,
          statement_timestamp() AS updated_at
      `);
      return result.rows[0];
    },
  };
}
