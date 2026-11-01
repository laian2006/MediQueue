# Backend Express

Trực hoàn thiện app, cấu hình, pool/transaction và lệnh chạy/test ở 1.19; package.json hiện chỉ là metadata.

- app/: app.js tạo ứng dụng, server.js khởi động, routes.js ghép API. Chủ API phối hợp Trực đăng ký route.
- shared/config/env.js: đọc và kiểm tra cấu hình; T ghi vắng được nhóm chốt.
- shared/db/: pool.js và transaction.js dùng chung.
- shared/middleware/: Hưng chủ trì authenticate.js, require-staff.js; lỗi thống nhất theo hợp đồng.
- modules/auth và patients: Hưng.
- modules/sessions: An.
- modules/tickets: Đức Anh làm cấp/đọc/requestId, Đạt làm ticket-cancel.service.js.
- modules/queue: Hoàng Anh làm FIFO và tiếp nhận.
- modules/audit: Trực làm append-ticket-event.js, nhận giao dịch từ nghiệp vụ, không tự commit.
- modules/public-board: Trực trả phản hồi riêng chỉ gồm trường được phép.

routes nhận/kiểm tra đầu vào, service giữ quy tắc nghiệp vụ, repository truy vấn. Test nhỏ đặt __tests__ cạnh module; API/DB/đồng thời đặt tests/integration.

Các thao tác cạnh tranh thống nhất khóa QueueSession trước Ticket, thay đổi phiếu và sự kiện cùng giao dịch. Không tự viết lại quyền hoặc bộ quy tắc trạng thái trong mô đun khác.
