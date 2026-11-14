# Yêu cầu khung, nhật ký và bảng công khai — 1.21

Chủ trì: Phan Trung Trực (TV6). Reviewer: Trần Quang Trung. Căn cứ: [phạm vi](scope.md), [thiết kế v1.0](../architecture/shared-design-v1.0.md), [ERD](../architecture/erd.md), [OpenAPI](../api/openapi.yaml) và task 1.19–1.21 trong [WBS](../planning/task-map.md).

Trạng thái ngày 05/11/2026: bổ sung yêu cầu/AC để An duyệt; không phải bản đã được phê duyệt. Khung 1.19 và bảng 1.20 đã có trên nhánh bàn giao riêng, chưa ở main. Tài liệu này được viết sau phần triển khai đó, không ghi nhận giả bước duyệt trước khi code.

Cập nhật kỹ thuật 14/11/2026: khung 1.19 và tài liệu 1.21 đã merge, schema 003/004 và API cấp vé đã có trên main. Bảng 1.20 tích hợp nền main b8bae9e; API gọi 1.11 còn PR #13, đã thử trong bản ghép riêng. Trạng thái yêu cầu ngày 05/11 ở trên là lịch sử; chưa có bằng chứng An duyệt AC. Xem [bàn giao hiện tại](../sprints/sprint-1-platform.md).

## Phạm vi

Trực chủ trì khung React/Express/PostgreSQL, cấu hình/pool/transaction, helper TicketEvent, API và UI công khai. Không viết thay auth/PatientAccess (Hưng), Ticket/cấp số (Đức Anh), FIFO/gọi lượt (Hoàng Anh), vòng đời phiên (An), UI người bệnh (Đạt) hay console nhân viên (Trung).

## User stories và tiêu chí chấp nhận

### PLAT-01 — Thành viên chạy cùng một khung (1.19)

Là thành viên nhóm, tôi muốn cài và chạy dự án theo cùng một hướng dẫn để các mô đun dùng chung ứng dụng và DB.

- Node/npm/PostgreSQL và dependency được ghi rõ, có package-lock.json trong client và server; `npm ci` cài được.
- Cấu hình DB/secret tách khỏi mã, chỉ commit .env.example; client không nhận bí mật server.
- Lệnh migration chạy tuần tự và lưu lịch sử/checksum; chạy lại không tạo trùng; lỗi rollback, không tự reset DB.
- Seed chỉ chứa dữ liệu giả lập và chạy lại được. DB phát triển/test riêng, không reset DB tích hợp.
- Trang chủ đọc API kiểm tra kết nối PostgreSQL thật; mất kết nối không báo sẵn sàng giả.
- Ghép middleware xác thực thật của Hưng và router phiên của An, không thêm cơ chế bỏ qua quyền.

### PLAT-02 — Phiếu và nhật ký cùng giao dịch (1.19, bàn giao 1.7)

Là nhóm phát triển, tôi cần cập nhật Ticket và lưu sự kiện cùng thành công hoặc cùng hoàn tác để lịch sử không lệch nghiệp vụ.

- withTransaction dùng một client cho BEGIN, truy vấn nghiệp vụ, helper và COMMIT/ROLLBACK; luôn release kết nối.
- appendTicketEvent nhận chính client đó; chỉ INSERT có tham số, không tự lấy pool/kết nối hoặc tự commit.
- event gồm eventId, ticketId, actorUserId, action, fromStatus, toStatus, occurredAt theo ERD; DB tạo eventId/thời gian, actor lấy từ danh tính server.
- ISSUED có fromStatus=null; RECALLED ghi CALLED → CALLED; không tạo TicketEvent cho thao tác mở/ngừng/đóng phiên không có ticketId.
- 004 chỉ áp dụng sau Ticket 003. Khi Ticket chưa có, kiểm tra helper bằng test double; sau 1.7 cần thử nguyên tử Ticket/Event trên PostgreSQL thật.

### PLAT-03 — Xem bảng gọi số không cần đăng nhập (1.20)

Là người ở khu vực chờ, tôi muốn thấy số đang được gọi và các số đang chờ để biết khi nào đến quầy.

- GET /api/v1/public/board không cần đăng nhập, trả 200 envelope `{data: Board}`.
- Board có đúng currentTicket, waitingNumbers, updatedAt. currentTicket=null hoặc `{number,status}`, chỉ CALLED/REGISTERING; waitingNumbers chỉ WAITING, tăng dần.
- Chỉ đọc phiên OPEN/STOPPED; không có phiên chưa đóng thì currentTicket=null, waitingNumbers=[]. Không lấy số từ phiên CLOSED.
- Dữ liệu đến từ truy vấn PostgreSQL riêng và cùng một statement snapshot, không dùng dữ liệu giả trong luồng công khai.
- updatedAt là thời điểm snapshot trên server, trả UTC ISO 8601; no-store, không cache phản hồi.

### PLAT-04 — Bảng công khai bảo vệ danh tính (1.20)

Là người có hồ sơ, tôi muốn bảng công khai chỉ hiển thị số để không lộ danh tính hoặc dữ liệu riêng.

- JSON không có tên, mã hồ sơ, tài khoản, ticketId/sessionId/patientId, UUID nội bộ hay thông tin sức khỏe.
- Repository chỉ chọn trường công khai; DTO dùng danh sách trường cho phép ở cả snapshot và currentTicket. Không trả nguyên Ticket/PatientProfile rồi ẩn bằng UI.
- Query do người xem gửi không cho phép chuyển sang dữ liệu/DTO riêng.
- Lỗi DB trả thông báo chung, không SQL, stack trace hoặc chuỗi kết nối. Thiếu bảng phụ thuộc không được trả hàng rỗng giả.

### PLAT-05 — Nhận biết dữ liệu mới và lỗi mạng (1.20)

Là người xem bảng, tôi muốn bảng tự cập nhật và báo khi dữ liệu có thể đã cũ để không nhầm số.

- Tải ngay lúc mở; lần sau sau 3 giây từ khi yêu cầu trước kết thúc; không chồng yêu cầu.
- Phân biệt tải, chưa có số gọi, hàng rỗng, CALLED và REGISTERING bằng chữ rõ ràng.
- Lỗi lần đầu báo chưa tải được. Lỗi sau khi đã có dữ liệu giữ snapshot cuối kèm cảnh báo có thể đã cũ và thời điểm cập nhật gần nhất.
- Có thể thử lại, tự phục hồi sau khi API trở lại. Rời trang hủy fetch và bỏ phản hồi muộn; UI không sinh số hoặc quyết định nghiệp vụ.

## Điều kiện để nghiệm thu

Code/test riêng không thay thế luồng tích hợp. Cần ghép 1.19, 003/004 và API 1.8/1.11 rồi demo lấy số → gọi số → bảng hiển thị khớp; Trung đối chiếu console, Hưng rà dữ liệu công khai. Review, An duyệt AC, demo và retro còn phải có bằng chứng thật. Mục tiêu tải 50 client/p95/cập nhật theo thiết kế chung chưa được đo trong 1.21.
