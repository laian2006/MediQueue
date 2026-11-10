# Mô đun phiếu — task 1.7 và 1.8 của Đức Anh

## Phạm vi đã triển khai

- Migration `database/migrations/003_tickets.sql` tạo bảng `tickets` theo ERD v1.0.
- Cấp số trong một giao dịch (1.7): khóa `queue_sessions` → kiểm tra OPEN →
  kiểm tra phiếu hoạt động → tăng `last_issued_number` → tạo WAITING → ghi
  TicketEvent `ISSUED`.
- `POST /api/v1/tickets`: chỉ REPRESENTATIVE có PatientAccess, body đúng
  `{patientId, sessionId, requestId}`. Thành công trả 201 `{data: TicketView}`.
- `GET /api/v1/tickets/{ticketId}`: đọc phiếu theo id, ở mọi trạng thái.
- `GET /api/v1/tickets/active?patientId=&sessionId=`: phiếu WAITING, CALLED
  hoặc REGISTERING của hồ sơ trong phiên. Không có thì trả `200 {data: null}`.
- `TicketView = {ticket, waitingAhead}`. `ticket` có đúng 8 trường: ticketId,
  sessionId, patientId, number, status, lastCalledAt, createdAt, updatedAt.
  Thời gian là UTC ISO 8601. `waitingAhead` là số phiếu WAITING cùng phiên có
  number nhỏ hơn; null khi phiếu không WAITING. Đây không phải thời gian chờ.
- **Chưa có:**
  - Trả lại phiếu cũ khi gửi lại cùng `requestId` (2.7). Ở Sprint 1, trùng
    (người gửi, requestId) trả 409 `IDEMPOTENCY_CONFLICT`.
  - 004 và helper TicketEvent thật, chờ 1.19.

## Mã lỗi

| HTTP | code | Khi nào |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | Body/query/id sai, thiếu hoặc thừa trường; body không phải JSON |
| 401 | UNAUTHENTICATED | Chưa đăng nhập |
| 403 | FORBIDDEN | STAFF; hồ sơ ngoài PatientAccess (không trả trường nào của phiếu) |
| 404 | NOT_FOUND | Không có phiên (`POST`) hoặc không có phiếu (`GET /{ticketId}`) |
| 409 | INVALID_STATE | Phiên STOPPED/CLOSED (An chốt 04/11) |
| 409 | ACTIVE_TICKET_EXISTS | Hồ sơ đã có phiếu hoạt động; `details.ticketId` là phiếu đó |
| 409 | IDEMPOTENCY_CONFLICT | Sprint 1: cùng người gửi dùng lại requestId |

Body lỗi luôn là `{error: {code, message, details?}}`. Mọi phản hồi của router
đều có `Cache-Control: no-store`.

## Phân lớp và vị trí tệp

- `ticket.routes.js`: Router Express, kiểm tra JSON, mã HTTP và body.
  `/active` được khai báo trước `/:ticketId`.
- `ticket-issue.service.js`: luật cấp số và giao dịch (1.7).
- `ticket-query.service.js`: đọc phiếu, quyền theo `patient_id` của phiếu.
  Với `/active`, quyền được kiểm tra trước khi truy vấn.
- `ticket.repository.js`: SQL tham số hóa. Phiếu và `waitingAhead` lấy trong
  cùng một câu SQL.
- `ticket.dto.js`, `ticket.errors.js`: DTO, TicketView và lỗi nghiệp vụ.

## Ghép vào app chung (Trực)

`db`, `withTransaction`, `appendTicketEvent` là đầu ra của 1.19.
`authenticate`, `patientAccess` là đầu ra của Hưng.

```js
import { createTicketRepository } from '../modules/tickets/ticket.repository.js';
import { createTicketIssueService } from '../modules/tickets/ticket-issue.service.js';
import { createTicketQueryService } from '../modules/tickets/ticket-query.service.js';
import { createTicketRouter } from '../modules/tickets/ticket.routes.js';

const issueService = createTicketIssueService({
  db, withTransaction, createRepository: createTicketRepository, patientAccess, appendTicketEvent,
});
const queryService = createTicketQueryService({
  db, createRepository: createTicketRepository, patientAccess,
});
app.use('/api/v1/tickets', createTicketRouter({ issueService, queryService, authenticate }));
```

- Đăng ký `express.json()` trước router và error handler chung sau router.
- Thiếu `authenticate` hoặc một service thì router báo lỗi ngay khi khởi tạo.
  Không có chế độ bỏ qua xác thực.
- **Giao kèo đang chờ Trực xác nhận:**
  - `withTransaction(fn)` chạy `fn(client)` trong một giao dịch: thành công thì
    COMMIT, `fn` ném lỗi thì ROLLBACK rồi ném lại lỗi đó.
  - `appendTicketEvent(client, {ticketId, actorUserId, action, fromStatus, toStatus})`
    ghi trên chính `client` đó và không tự commit.
  - Nếu tên hoặc tham số khác, mình sẽ sửa ở `task/1.7-r2`.
- Error handler chung nên trả 400 `VALIDATION_ERROR` kèm `no-store` cho lỗi
  parse JSON. Xem `docs/testing/cases/1-8.md`.

## Dùng cho giao diện người bệnh (Đạt, 1.14)

- **Lấy số:** sinh `requestId` (UUID v4) **một lần** cho mỗi lượt bấm, rồi gửi
  `{patientId, sessionId, requestId}`. Không gửi người tạo, số phiếu hay trạng
  thái. Khi thử lại cùng một lượt thì giữ nguyên `requestId`. Ở Sprint 1 việc
  thử lại vẫn nhận 409; từ 2.7 sẽ nhận lại phiếu cũ.
- **409 `ACTIVE_TICKET_EXISTS`:** dùng `details.ticketId` để mở phiếu đang có,
  không báo lỗi chung chung.
- **Sau khi tải lại trang:** gọi `GET /active` cho hồ sơ đang chọn. `data: null`
  nghĩa là chưa có phiếu hoạt động.
- **Cập nhật định kỳ:** gọi `GET /{ticketId}`. Hiển thị `waitingAhead` khi phiếu
  WAITING. Khi giá trị là null, hiển thị theo trạng thái (CALLED, REGISTERING,
  COMPLETED, CANCELLED, NO_SHOW). Không tự tính vị trí ở trình duyệt.

## Dùng cho FIFO và bảng công khai

- **Hoàng Anh:**
  - Index `ix_tickets_waiting (session_id, number) WHERE status = 'WAITING'`
    phục vụ chọn số nhỏ nhất.
  - `uq_tickets_counter_slot` chặn lượt thứ hai đang CALLED/REGISTERING trong
    một phiên. Cần bạn xác nhận index này.
  - Mọi chuyển trạng thái phải giữ `uq_tickets_active_patient`.
- **Trực:** bảng công khai đọc truy vấn riêng, không tái dùng TicketView. Không
  trả patientId hay người lấy số.

## Kiểm thử và chạy lại

Trong `server/`, cần Express, pg và DB test riêng có quyền tạo schema. Các test
tự tạo schema `mq_tickets_test_<UUID>` / `mq_tickets_api_<UUID>` và xóa sau khi
chạy. Thiếu `TEST_DATABASE_URL` thì test tích hợp ghi SKIP, không được tính là
đạt.

```bash
node --test src/modules/tickets/__tests__/*.test.js
TEST_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/mediqueue_test' \
node --test tests/integration/tickets.test.js tests/integration/tickets.api.test.js
```

Header `x-test-actor`, `withTransaction` và `test_ticket_events` trong test chỉ
là bản thay thế. Không dùng chúng trong app thật.

Kết quả: `docs/testing/cases/1-7.md`, `docs/testing/cases/1-8.md`.

## Điều kiện bàn giao và nghiệm thu

Trước khi đóng 1.7 và 1.8:
- Ghép 004 và helper thật (1.19), chạy lại DB-01, DB-06, DB-11.
- Ghép router vào app chung với cookie thật của Hưng.
- Hưng review; An merge; kiểm tra lại trên main.
- Đạt xác nhận đã gọi được API ở 1.14.

Không đóng task chỉ vì test với bản thay thế đã đạt.
