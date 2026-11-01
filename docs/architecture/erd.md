# Dữ liệu MediQueue

Phiên bản 1.0 ban hành ngày 01/11/2026 — **ÁP DỤNG TRIỂN KHAI**. API camelCase, DB snake_case; PK/FK UUID, thời gian có múi giờ.

## User — users
user_id, username, display_name, password_hash, role

PK user_id; username duy nhất; role REPRESENTATIVE hoặc STAFF; mật khẩu không lưu rõ.

## PatientProfile — patient_profiles
patient_id, code, display_name

PK patient_id; code duy nhất; dữ liệu giả lập.

## PatientAccess — patient_access
user_id, patient_id

PK ghép hai cột; FK tới users và patient_profiles; dùng cho người đại diện.

## QueueSession — queue_sessions
session_id, status, last_issued_number, opened_by, opened_at, stopped_by, stopped_at, closed_by, closed_at, updated_at

PK; status OPEN/STOPPED/CLOSED; bộ đếm ≥0; các *_by là FK users, stopped/closed có thể null.

## Ticket — tickets
ticket_id, session_id, patient_id, issued_by_user_id, request_id, number, status, last_called_at, created_at, updated_at

PK; FK phiên/hồ sơ/người gửi; number ≥1; status theo vòng đời; last_called_at null khi chưa gọi.

## TicketEvent — ticket_events
event_id, ticket_id, actor_user_id, action, from_status, to_status, occurred_at

PK; FK Ticket/User; from_status null ở ISSUED; không sửa/xóa lịch sử trong luồng ứng dụng.

## Quan hệ
User 1:N PatientAccess; PatientProfile 1:N PatientAccess. User 1:N Ticket qua issued_by_user_id; PatientProfile 1:N Ticket; QueueSession 1:N Ticket; Ticket 1:N TicketEvent. Các *_by và actor_user_id là FK User.

## Ràng buộc
- Một phiên OPEN/STOPPED trên toàn hệ thống.
- Unique (session_id, number).
- Unique (session_id, patient_id) với status WAITING/CALLED/REGISTERING.
- Một Ticket CALLED/REGISTERING trong mỗi phiên.
- Unique (issued_by_user_id, request_id) trên toàn lịch sử.
- from_status có thể null ở ISSUED; các sự kiện khác lưu trạng thái trước/sau, kể cả RECALLED CALLED→CALLED.

## Auth store và migration
Store đăng nhập PostgreSQL là hạ tầng xác thực ngoài sáu thực thể nghiệp vụ. Hưng/Trực chốt công cụ, table/DDL và thứ tự migration với An. 001_identity: Hưng; 002_sessions: An; 003_tickets: Đức Anh; 004_ticket_events: Trực thiết kế ở 1.19, Đức Anh ghép ở 1.7 sau Ticket. Không chiếm số đã giao hoặc sửa migration đã áp dụng.
