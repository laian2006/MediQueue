# Cơ sở dữ liệu PostgreSQL

Mỗi máy có DB thử riêng, cùng schema/seed; DB tích hợp được xác định riêng. Không reset DB người khác hoặc DB tích hợp nếu chưa thống nhất.

## Migration ban đầu theo kế hoạch

1. 001_identity.sql — Hưng, 1.4: User, PatientProfile, PatientAccess.
2. 002_sessions.sql — An, 1.1: QueueSession.
3. 003_tickets.sql — Đức Anh, 1.7: Ticket.
4. 004_ticket_events.sql — Trực thiết kế ở 1.19, Đức Anh ghép cùng 1.7: TicketEvent sau Ticket, đủ khóa ngoại và test giao dịch.

Ở 1.19, Trực bàn giao thiết kế sự kiện/helper và dùng test double khi Ticket chưa có. Ở 1.7, Đức Anh ghép 003/004 theo hợp đồng và phối hợp Trực test DB thật. Không đưa migration thiếu bảng được tham chiếu lên main.

Chưa tạo tệp SQL rỗng. Khi triển khai, An/Trực chốt công cụ và lệnh áp dụng trong README, bảo đảm thứ tự và ghi nhận migration đã chạy. Migration đã áp dụng không sửa; đăng ký số mới như 005_ten_thay_doi.sql.

seeds/ chỉ chứa dữ liệu giả lập: nhân viên, hai đại diện có hồ sơ chung và hồ sơ riêng. Seed không thay thế migration và không chứa thông tin người thật.
