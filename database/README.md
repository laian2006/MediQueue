# Cơ sở dữ liệu PostgreSQL

Mỗi máy có DB thử riêng, cùng schema/seed; DB tích hợp được xác định riêng. Không reset DB người khác hoặc DB tích hợp nếu chưa thống nhất.

## Migration ban đầu theo kế hoạch

1. 001_identity.sql — Hưng, 1.4: User, PatientProfile, PatientAccess.
2. 002_sessions.sql — An, 1.1: QueueSession.
3. 003_tickets.sql — Đức Anh, 1.7: Ticket.
4. 004_ticket_events.sql — Trực thiết kế ở 1.19, Đức Anh ghép cùng 1.7: TicketEvent sau Ticket, đủ khóa ngoại và test giao dịch.

Ở 1.19, Trực bàn giao thiết kế sự kiện/helper và dùng test double khi Ticket chưa có. Ở 1.7, Đức Anh ghép 003/004 theo hợp đồng và phối hợp Trực test DB thật. Không đưa migration thiếu bảng được tham chiếu lên main.

Chưa tạo tệp SQL rỗng. Từ thư mục `server`, sau khi cài và cấu hình `.env`, chạy `npm run db:migrate`, sau đó `npm run db:seed`. Runner đọc tệp `NNN_ten.sql` theo thứ tự, khóa chống chạy đồng thời, lưu tên/checksum vào `schema_migrations` và rollback toàn bộ lượt chạy nếu lỗi. Chạy lại không áp dụng lại migration cũ; từ chối tệp đã áp dụng bị sửa/mất hoặc migration chen trước lịch sử hiện có. Migration đã áp dụng không sửa; đăng ký số mới như 005_ten_thay_doi.sql. Đừng áp dụng SQL thủ công rồi chạy runner trên cùng DB không có lịch sử; dùng DB phát triển mới hoặc thống nhất cách chuyển đổi trước.

Thiết kế 004 nằm trong [TicketEvent](../docs/architecture/ticket-event.md), chưa có migration 004 trong 1.19 vì chưa có bảng Ticket 003. Không đưa DDL này vào thư mục migrations trước task 1.7. Store `auth_sessions` do `connect-pg-simple` tạo khi dùng xác thực; đây là bảng kỹ thuật ngoài số migration nghiệp vụ.

seeds/ chỉ chứa dữ liệu giả lập: nhân viên, hai đại diện có hồ sơ chung và hồ sơ riêng. Seed không thay thế migration và không chứa thông tin người thật.
