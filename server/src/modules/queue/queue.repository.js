const TICKET_COLUMNS = `
  ticket_id,
  session_id,
  patient_id,
  number,
  status,
  last_called_at,
  created_at,
  updated_at
`;

export function createQueueRepository(db) {
  if (typeof db?.query !== 'function') {
    throw new TypeError('A PostgreSQL query interface is required.');
  }

  return {
    async lockSession(sessionId) {
      // Khóa phiên trước khi đọc và cập nhật các phiếu cạnh tranh.
      const result = await db.query(`
        SELECT session_id, status
        FROM queue_sessions
        WHERE session_id = $1
        FOR UPDATE
      `, [sessionId]);

      return result.rows[0] ?? null;
    },

    async listActive(sessionId, lock = false) {
      // Đọc cả phiếu chờ và phiếu chiếm quầy.
      // Chuỗi khóa chỉ do chương trình lựa chọn, không lấy từ người dùng.
      const result = await db.query(`
        SELECT ${TICKET_COLUMNS}
        FROM tickets
        WHERE session_id = $1
          AND status IN ('WAITING', 'CALLED', 'REGISTERING')
        ORDER BY number ASC
        ${lock ? 'FOR UPDATE' : ''}
      `, [sessionId]);

      return result.rows;
    },

    async markCalled(ticketId, sessionId) {
      // Thời gian được tính sau khi giao dịch đã lấy được khóa phiên.
      const result = await db.query(`
        UPDATE tickets
        SET status = 'CALLED',
            last_called_at = statement_timestamp(),
            updated_at = statement_timestamp()
        WHERE ticket_id = $1
          AND session_id = $2
          AND status = 'WAITING'
        RETURNING ${TICKET_COLUMNS}
      `, [ticketId, sessionId]);

      return result.rows[0] ?? null;
    },

        async findTicketSession(ticketId) {
      // Chỉ đọc vị trí phiếu, chưa khóa phiếu trước phiên.
      const result = await db.query(`
        SELECT session_id
        FROM tickets
        WHERE ticket_id = $1
      `, [ticketId]);

      return result.rows[0] ?? null;
    },

    async lockTicket(ticketId, sessionId) {
      // Service phải khóa phiên trước khi gọi method này.
      const result = await db.query(`
        SELECT ${TICKET_COLUMNS}
        FROM tickets
        WHERE ticket_id = $1
          AND session_id = $2
        FOR UPDATE
      `, [ticketId, sessionId]);

      return result.rows[0] ?? null;
    },

    async updateLifecycle({
      ticketId,
      sessionId,
      fromStatus,
      toStatus,
      refreshCalledAt,
    }) {
      // Kiểm tra lại trạng thái ngay trong câu cập nhật.
      // Chỉ thao tác gọi lại mới thay đổi last_called_at.
      const result = await db.query(`
        UPDATE tickets
        SET status = $4,
            last_called_at = CASE
              WHEN $5::boolean THEN statement_timestamp()
              ELSE last_called_at
            END,
            updated_at = statement_timestamp()
        WHERE ticket_id = $1
          AND session_id = $2
          AND status = $3
        RETURNING ${TICKET_COLUMNS}
      `, [
        ticketId,
        sessionId,
        fromStatus,
        toStatus,
        refreshCalledAt,
      ]);

      return result.rows[0] ?? null;
    },
  };
}