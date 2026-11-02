# Yêu cầu mô đun phiếu (tickets)

WBS: 1.9. Chủ trì: Lê Đức Anh (TV2). Reviewer: Lê Gia Hưng.

Trạng thái: bản nháp để An duyệt user stories/AC. Chưa được duyệt và chưa đủ
điều kiện đóng task 1.9. Đây là phần phân tích đầu Sprint 1, viết trước khi code.
Tài liệu không thay thế review chéo, kiểm tra tích hợp hoặc sự kiện sprint.

## Căn cứ và phạm vi

- `docs/architecture/shared-design-v1.0.md`, `docs/api/openapi.yaml`,
  `docs/architecture/erd.md`, `docs/architecture/ticket-state-machine.md`.
- Sprint Plan VI, task 1.7, 1.8, 1.9, 2.7, 2.8, 3.7, 3.8 và hướng dẫn TV2.
- Đức Anh làm Ticket, cấp số, đọc phiếu riêng, `waitingAhead` và `requestId`.
- Ngoài phạm vi: hủy phiếu (Đạt, 2.13), gọi/tiếp nhận/ghi vắng (Hoàng Anh),
  vòng đời phiên (An), xác thực và PatientAccess (Hưng), helper TicketEvent (Trực).
- API phiếu riêng chỉ dành cho REPRESENTATIVE có PatientAccess. STAFF không dùng
  các API này trong phạm vi hiện tại.
- Sprint 1 làm cấp số, đọc phiếu và ràng buộc DB. Gửi lại đầy đủ (2.7) và
  kiểm thử đồng thời (2.8) thuộc Sprint 2.

## User stories và tiêu chí chấp nhận

### TIC-01 Lấy số cho hồ sơ được phép (1.7, 1.8)

Là người đại diện đã đăng nhập, tôi muốn lấy số cho hồ sơ mình được phép để
được xếp vào hàng chờ của phiên đang OPEN.

- `POST /api/v1/tickets` nhận đúng `patientId`, `sessionId`, `requestId`, cả ba
  là UUID. Thiếu trường, sai định dạng hoặc có trường thừa trả 400.
- Chưa đăng nhập trả 401. Tài khoản STAFF hoặc không có PatientAccess với
  `patientId` trả 403. Không tạo phiếu và không đổi bộ đếm.
- `sessionId` không tồn tại trả 404. Phiên STOPPED hoặc CLOSED trả 409 và không
  cấp số mới.
- Thành công trả 201 `{data: TicketView}`. `ticket.status` là WAITING và
  `number` bằng `last_issued_number + 1` của chính phiên đó.
- `issued_by_user_id` lấy từ phiên đăng nhập, không lấy từ body.
- Tạo Ticket, tăng `last_issued_number` và ghi TicketEvent `ISSUED`
  (null → WAITING, actor là người gửi) trong cùng một giao dịch. Khóa
  `queue_sessions` trước `tickets`. Lỗi giữa chừng phải hoàn tác toàn bộ.
- Không lấy số bằng cách đếm phiếu hiện có. Số đã cấp không được cấp lại, kể cả
  khi phiếu bị hủy hoặc đã kết thúc.

### TIC-02 Một phiếu hoạt động cho mỗi hồ sơ trong phiên (1.7, 2.8)

Là nhân viên vận hành, tôi cần mỗi người bệnh chỉ có một lượt đang hoạt động,
dù có nhiều người đại diện.

- Hồ sơ đã có phiếu WAITING, CALLED hoặc REGISTERING trong phiên mà gửi kèm
  `requestId` mới thì trả 409 `ACTIVE_TICKET_EXISTS`, kèm `details.ticketId` của
  phiếu đang có.
- Quy tắc áp dụng theo `patientId`, không theo tài khoản: đại diện thứ hai của
  cùng hồ sơ cũng nhận 409.
- Một tài khoản lấy số cho hai hồ sơ khác nhau thì được hai phiếu riêng, mỗi
  phiếu gắn đúng `patientId`.
- Khi phiếu cũ đã kết thúc (COMPLETED, CANCELLED, NO_SHOW) và phiên vẫn OPEN,
  hồ sơ lấy được phiếu mới với `requestId` mới. Số mới lớn hơn số cũ.
- Partial unique index ở DB chặn phiếu thứ hai khi có yêu cầu đồng thời. Không
  dựa vào việc ẩn nút trên UI.

### TIC-03 Xem phiếu theo ticketId (1.8)

Là người đại diện, tôi muốn mở lại phiếu đã lấy, kể cả phiếu đã kết thúc.

- `GET /api/v1/tickets/{ticketId}` trả 200 `{data: TicketView}` với mọi trạng
  thái của phiếu.
- Quyền kiểm tra theo `patientId` của phiếu. Đại diện khác có PatientAccess với
  cùng hồ sơ xem được phiếu đó.
- Không có quyền với hồ sơ thì trả 403 và không trả trường nào của phiếu, kể cả
  khi biết `ticketId`.
- `ticketId` sai định dạng trả 400. Không tồn tại trả 404.

### TIC-04 Tìm phiếu đang hoạt động sau khi tải lại trang (1.8)

Là người đại diện, tôi muốn tìm lại phiếu đang hoạt động của hồ sơ sau khi tải
lại trang hoặc đổi thiết bị.

- `GET /api/v1/tickets/active?patientId=...&sessionId=...` kiểm tra quyền theo
  `patientId` trước khi truy vấn.
- Có phiếu WAITING, CALLED hoặc REGISTERING thì trả `{data: TicketView}`. Không
  có thì trả 200 với `data: null`.
- Thiếu tham số hoặc sai định dạng UUID trả 400.

### TIC-05 Số phiếu đang chờ phía trước (1.8)

Là người đại diện, tôi muốn biết còn bao nhiêu phiếu chờ trước mình.

- Khi phiếu đang WAITING, `waitingAhead` là số phiếu WAITING cùng phiên có
  `number` nhỏ hơn. Giá trị có thể bằng 0.
- Không tính phiếu CANCELLED, NO_SHOW, COMPLETED và phiếu đang CALLED hoặc
  REGISTERING.
- Khi phiếu không ở trạng thái WAITING, `waitingAhead` là null.
- Sau khi phiếu được gọi, lần đọc kế tiếp trả `status = CALLED` và
  `waitingAhead = null`.
- `waitingAhead` không phải thời gian chờ dự kiến.

### TIC-06 Gửi lại không sinh phiếu mới (2.7)

Là người đại diện dùng mạng chậm, tôi muốn bấm thử lại mà không bị cấp thêm số.

- Khóa gửi lại là (`issued_by_user_id`, `request_id`), tra trên toàn bộ lịch sử
  Ticket. Việc tra diễn ra sau khi xác thực và kiểm tra quyền, nhưng trước khi
  kiểm tra phiên OPEN.
- Cùng khóa, cùng `patientId` và `sessionId` thì trả 200 với cùng `ticketId` và
  trạng thái hiện tại. Áp dụng cả khi phiếu đã kết thúc hoặc phiên đã đóng.
  Không tăng số và không ghi thêm sự kiện.
- Cùng khóa nhưng khác `patientId` hoặc `sessionId` trả 409
  `IDEMPOTENCY_CONFLICT`. Không ghi đè yêu cầu cũ.
- Tài khoản đã mất quyền với hồ sơ thì nhận 403. Không dùng gửi lại để đọc
  phiếu ngoài quyền.
- Hai lần gửi lại đồng thời cùng khóa chỉ tạo một phiếu. Khi gặp vi phạm unique,
  server rollback, đọc lại yêu cầu cũ và trả 200, không trả 500.

### TIC-07 Cấp số đồng thời và ngừng nhận số (2.8, 3.7, 3.8)

Là nhóm vận hành, tôi cần cấp số đúng khi có nhiều yêu cầu cùng lúc hoặc khi
phiên vừa ngừng nhận số.

- 20 hồ sơ khác nhau gửi đồng thời thì được 20 phiếu, 20 số khác nhau và 20 sự
  kiện ISSUED trong DB.
- Hai đại diện của cùng hồ sơ gửi đồng thời với hai `requestId` khác nhau thì
  chỉ có một phiếu hoạt động. Yêu cầu còn lại nhận 409 `ACTIVE_TICKET_EXISTS`.
- Sau khi STOPPED đã được commit, yêu cầu cấp mới không tạo phiếu.
- Khởi động lại API không làm mất phiếu và không cấp lại số đã dùng.
- Test đồng thời kiểm tra dữ liệu cuối trong DB, không chỉ mã HTTP.

## Dữ liệu bàn giao trong 1.7

- `003_tickets.sql`: bảng `tickets` gồm `ticket_id`, `session_id`, `patient_id`,
  `issued_by_user_id`, `request_id`, `number`, `status`, `last_called_at`,
  `created_at`, `updated_at`. Dùng UUID và `TIMESTAMPTZ`; FK tới
  `queue_sessions`, `patient_profiles` và `users`.
- Ràng buộc: CHECK `number >= 1`; CHECK `status` thuộc sáu trạng thái; unique
  (`session_id`, `number`); partial unique (`session_id`, `patient_id`) với
  WAITING/CALLED/REGISTERING; unique (`issued_by_user_id`, `request_id`).
- Ràng buộc một phiếu CALLED/REGISTERING mỗi phiên thuộc quy tắc của Hoàng Anh.
  Hai bên cần thống nhất đặt index này ở 003 hay ở migration riêng.
- `004_ticket_events.sql` ghép theo thiết kế `ticket-event.md` của Trực (1.19).
- API trả camelCase qua DTO thống nhất; DB dùng snake_case.

## Ranh giới và bàn giao

- 1.7: `ticket-issue.service.js`, `ticket.repository.js`, migration 003/004 và
  test giao dịch trên PostgreSQL thật. Bàn giao cấu trúc Ticket cho Hoàng Anh,
  Đạt và Trực.
- 1.8: `ticket.routes.js` và `ticket-query.service.js`. Quyền dùng
  `patient-access.service.js` của Hưng. Gửi ví dụ phản hồi và lỗi cho Đạt trước
  khi 1.14 bắt đầu.
- Hoàng Anh đọc Ticket để gọi FIFO. Mọi chuyển trạng thái phải giữ ràng buộc
  một phiếu hoạt động.
- Trực làm API công khai riêng, không tái dùng TicketView.
- Không sửa auth, phiên, FIFO, hủy hoặc khung app thay chủ mô đun.

## Câu hỏi cần An chốt

1. **Mã lỗi khi lấy số mới lúc phiên STOPPED hoặc CLOSED.** v1.0 quy định 409
   nhưng chưa nêu `code`. Đề xuất dùng `INVALID_STATE`, giống các API phiên.
   Cũng có thể dùng mã riêng như `SESSION_NOT_OPEN` để Đạt hiển thị thông báo
   rõ hơn.
2. **Thứ tự kiểm tra của `POST /tickets`.** Đề xuất: 400 đầu vào, 401, 403 vai
   trò, 403 PatientAccess, tra khóa gửi lại, 404 phiên, 409 phiên không OPEN,
   rồi 409 `ACTIVE_TICKET_EXISTS`. Cách này giữ đúng nguyên tắc kiểm tra quyền
   trước khi trả dữ liệu và tra yêu cầu cũ trước điều kiện OPEN.

## Phần còn lại của task 1.9

- An duyệt user stories/AC.
- Cập nhật `docs/modules/tickets.md` theo phần đã tích hợp sau 1.7 và 1.8.
- Review 1.10 và 1.11 của Hoàng Anh; xử lý review phần mình.
- Kiểm tra tích hợp, planning, review và retrospective có bằng chứng trên Issue.
- 8 giờ trong kế hoạch là ước lượng; giờ thực tế do tác giả tự ghi.
