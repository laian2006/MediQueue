# TicketEvent — bàn giao task 1.19

Theo thiết kế chung v1.0, ERD và vòng đời hiện hành. Chủ khung/helper: Trực. Đức Anh ghép 003_tickets.sql rồi 004_ticket_events.sql ở 1.7 và phối hợp kiểm tra DB thật. Tại 1.19 chưa có Ticket; DDL dưới là hợp đồng bàn giao, chưa phải migration đã áp dụng.

## Giao diện helper

```js
import { withTransaction } from '../../shared/db/transaction.js';
import { appendTicketEvent } from '../audit/append-ticket-event.js';

await withTransaction(pool, async (transaction) => {
  // Khóa QueueSession rồi Ticket; kiểm tra quyền, phiên và chuyển trạng thái.
  // Cập nhật Ticket bằng cùng transaction.query(...).
  await appendTicketEvent(transaction, {
    ticketId,
    actorUserId: actor.userId, // từ danh tính server, không lấy body hoặc header tự khai
    action: 'ISSUED',
    fromStatus: null,
    toStatus: 'WAITING',
  });
});
```

Helper chỉ gọi một INSERT có tham số trên chính client truyền vào. Không import pool, không lấy kết nối mới, không BEGIN/COMMIT/ROLLBACK, không nuốt lỗi. Kết quả là bản ghi DB gồm bảy trường snake_case trong ERD; không dùng bản ghi này làm phản hồi công khai. UUID event và occurred_at do PostgreSQL tạo; không nhận thời gian hay actor từ trình duyệt.

Helper kiểm tra dạng UUID/action/status và yêu cầu fromStatus=null khi ISSUED, fromStatus hợp lệ cho các action khác. Service nghiệp vụ của chủ mô đun vẫn chịu trách nhiệm kiểm tra quyền và chuyển trạng thái dưới khóa; helper không thay thế bộ quy tắc queue.rules.js.

## DDL đề xuất cho 004 sau 003

```sql
CREATE TABLE ticket_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(ticket_id),
    actor_user_id UUID NOT NULL REFERENCES users(user_id),
    action TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT ck_ticket_events_action CHECK (
        action IN ('ISSUED','CALLED','RECALLED','STARTED','COMPLETED','CANCELLED','NO_SHOW')
    ),
    CONSTRAINT ck_ticket_events_from_status CHECK (
        from_status IS NULL OR from_status IN ('WAITING','CALLED','REGISTERING','COMPLETED','CANCELLED','NO_SHOW')
    ),
    CONSTRAINT ck_ticket_events_to_status CHECK (
        to_status IN ('WAITING','CALLED','REGISTERING','COMPLETED','CANCELLED','NO_SHOW')
    ),
    CONSTRAINT ck_ticket_events_initial CHECK (
        (action = 'ISSUED' AND from_status IS NULL)
        OR (action <> 'ISSUED' AND from_status IS NOT NULL)
    )
);
CREATE INDEX ix_ticket_events_ticket_time ON ticket_events(ticket_id, occurred_at, event_id);
```

Không ON DELETE CASCADE: lịch sử không bị xóa theo phiếu/user. Luồng ứng dụng chỉ append, không UPDATE/DELETE lịch sử. Mở/ngừng/đóng QueueSession dùng trường người/thời điểm của phiên, không tạo TicketEvent thiếu ticketId. RECALLED ghi CALLED → CALLED, giữ phiếu/số và đổi last_called_at trong cùng giao dịch.

## Bằng chứng cần ở 1.7

- Tạo/đổi Ticket và append thành công: cả hai tồn tại sau commit.
- Cho INSERT sự kiện lỗi: Ticket, bộ đếm và sự kiện đều rollback; không trả thành công.
- Khởi động lại API vẫn còn Ticket/lịch sử; FK bảo vệ ticket_id và actor_user_id.
- Gửi lại requestId hợp lệ không sinh thêm phiếu/sự kiện; cạnh tranh dùng cùng thứ tự khóa.

1.19 đã kiểm tra helper bằng test double và transaction rollback trên PostgreSQL thật với bảng hiện có. Chưa có kiểm thử nguyên tử Ticket/TicketEvent thật khi Ticket chưa được ghép.
