# Yêu cầu mô đun người bệnh

WBS: 1.15. Chủ trì: Đặng Thành Đạt (TV4). Reviewer: Hồ Sỹ Hoàng Anh.

Trạng thái: bản nháp để An duyệt user stories/AC. Chưa có xác nhận duyệt,
chưa đủ điều kiện đóng task 1.15. Đây là phần phân tích đầu Sprint 1, không
thay thế review chéo, kiểm tra tích hợp hoặc sự kiện sprint.

## Căn cứ và phạm vi

- `docs/architecture/shared-design-v1.0.md` và `docs/api/openapi.yaml`.
- [Sprint Plan EN](../planning/MediQueue_Group11_Sprint_Plan.xlsx), task 1.13, 1.14, 1.15 và hướng dẫn TV4.
- Một quầy, một hàng thông thường, tài khoản và hồ sơ giả lập.
- Đạt làm màn hình sau đăng nhập; Hưng làm LoginPage và quyền hồ sơ.
- Task 1.13 dùng mock; task 1.14 nối API thật và PostgreSQL.
- Hủy phiếu, polling 3 giây và phục hồi kết nối đầy đủ thuộc Sprint 2.

## User stories và tiêu chí chấp nhận

### PAT-01 Chọn đúng hồ sơ

Là người đại diện đã đăng nhập, tôi muốn chọn hồ sơ được cấp quyền để xem
và lấy số cho đúng người bệnh.

- Danh sách dùng `GET /api/v1/patients`, gồm `patientId`, `code`, `displayName`.
- Hồ sơ đang chọn luôn được thể hiện rõ bằng tên và mã.
- Đổi hồ sơ xóa phiếu cũ ngay; phản hồi cũ về trễ không ghi đè hồ sơ mới.
- Không có hồ sơ thì giải thích rõ và không cho lấy số.
- Lỗi tải hồ sơ được báo bằng chữ; UI không tự cấp hoặc thêm hồ sơ.

### PAT-02 Lấy số trong phiên đang nhận

Là người đại diện, tôi muốn lấy số cho hồ sơ đã chọn khi phiên đang OPEN.

- Dùng phiên từ `GET /api/v1/sessions/current`; `data=null` nghĩa là chưa có phiên.
- Khi chưa chọn hồ sơ, đang tải, đang gửi, không có phiên hoặc phiên không OPEN,
  nút lấy số không được phép gửi yêu cầu mới.
- `POST /api/v1/tickets` gửi `patientId`, `sessionId`, `requestId`.
- Chỉ hiển thị phiếu sau phản hồi thành công; lỗi không được coi là đã lấy số.
- Task 1.14 giữ nguyên cả ba trường khi thử lại cùng thao tác. Backend quyết
  định cấp số, quyền và chống trùng; UI không tự tạo số thứ tự.

### PAT-03 Xem phiếu và số người đang chờ phía trước

Là người đại diện, tôi muốn xem số và trạng thái phiếu của hồ sơ đang chọn.

- Dùng `TicketView = { ticket, waitingAhead }` từ hợp đồng v1.0, bọc trong `{data}`.
- Dùng `GET /tickets/active?patientId=...&sessionId=...` để tìm phiếu hoạt động;
  task 1.14 kiểm tra đọc lại sau reload bằng API thật.
- WAITING hiển thị "Đang chờ" và `waitingAhead`, kể cả khi bằng 0.
- CALLED hiển thị "Đã được gọi" và hướng dẫn đến quầy.
- Các trạng thái được giải thích bằng chữ, không chỉ dựa vào màu.
- `waitingAhead` là số phiếu WAITING phía trước, không phải thời gian khám.
- COMPLETED chỉ nghĩa là hoàn tất đăng ký tại quầy.

### PAT-04 Dùng được trên màn hình nhỏ và khi tải lỗi

Là người dùng điện thoại, tôi muốn đọc rõ hồ sơ, số, trạng thái và thông báo.

- Màn hình rộng 360 px không tràn ngang, thao tác chính đọc và bấm được.
- Có trạng thái đang tải, không có hồ sơ, chưa có phiên, chưa có phiếu và lỗi.
- Trong lúc đang gửi, chặn bấm lấy số lặp và chặn đổi hồ sơ để tránh nhầm thao tác.
- Dùng label cho trường chọn, nút HTML và thông báo lỗi có thể đọc bằng trình đọc màn hình.

## Ranh giới và bàn giao

- 1.13: wireframe desktop/mobile, PatientPage và mock tách riêng, bằng chứng UI.
- 1.14: nối http.js chung sau 1.13 FS, 1.5 FS, 1.8 FS; xác minh trên DB thật.
- 2.13: chỉ REPRESENTATIVE có PatientAccess được hủy WAITING trong OPEN/STOPPED;
  Ticket và TicketEvent cùng giao dịch, khóa QueueSession trước Ticket.
- 2.14: nút hủy, polling 3 giây, dữ liệu cũ/mất mạng, xung đột và retry đầy đủ.
- Không sửa auth, cấp/đọc phiếu, FIFO hoặc khung app thay chủ mô đun.

## Phần còn lại của task 1.15

- An duyệt user stories/AC.
- Cập nhật tài liệu mô đun theo phần đã tích hợp.
- Đạt review task 1.16 và 1.17 của Trung; xử lý review phần mình.
- Kiểm tra tích hợp, planning, review và retrospective có bằng chứng.
- Chưa ghi giờ thực tế thay tác giả; 8 giờ trong kế hoạch là ước lượng.
