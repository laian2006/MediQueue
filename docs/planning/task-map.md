# Tra cứu task WBS

Nguồn: [Sprint Plan VI](MediQueue_Group11_Sprint_Plan_VI.xlsx). Giữ WBS làm mã trao đổi. FS: xong trước khi bắt đầu; FF: xong trước khi nghiệm thu. Task 8 giờ gồm tài liệu 2 giờ, review/phối hợp 4 giờ, sự kiện 2 giờ.

Đường dẫn dưới đây là nơi triển khai dự kiến. Các tệp code/SQL chưa được tạo; tác giả tạo trong task, theo hướng dẫn thư mục.

## Sprint 1 — Tuần 10–11

### Leader — Lại Quốc Bình An
Reviewer: Phan Trung Trực.

#### 1.1 — Thiết kế phiên và API mở phiên
- Giờ: 6. Phụ thuộc: —.
- AC: Mở được một phiên; mở phiên thứ hai bị từ chối.
- Đầu ra: Migration QueueSession; API mở/xem phiên; kiểm thử một phiên chưa đóng.
- Vị trí: `server/src/modules/sessions/session.routes.js`, `server/src/modules/sessions/session.service.js`, `database/migrations/002_sessions.sql`.
- Cách ghép: An thiết kế QueueSession, mở/đọc phiên trong mô đun sessions. Tách nhận yêu cầu khỏi quy tắc nghiệp vụ; dùng kết nối DB chung. Ghép session.routes.js vào server/src/app/routes.js qua PR có Trực phối hợp; chốt quyền với Hưng.
- Kiểm tra/bàn giao: Mở một phiên được; mở thêm khi có OPEN hoặc STOPPED bị từ chối. Kiểm tra gọi đồng thời và quyền nhân viên trước khi bàn giao API cho Đức Anh, Trung.

#### 1.2 — Giao diện quản lý phiên cơ bản
- Giờ: 6. Phụ thuộc: 1.1 FS; 1.4 FS.
- AC: Nhân viên xem được phiên; người dùng thường không mở được phiên.
- Đầu ra: Giao diện quản lý phiên; kiểm thử vai trò và tích hợp.
- Vị trí: `client/src/features/sessions/SessionPanel.jsx`, `client/src/features/sessions/session.api.js`.
- Cách ghép: An dựng khu vực phiên bằng API 1.1 và xác thực 1.4. Trung import SessionPanel vào StaffPage.jsx; An không tạo một ứng dụng React riêng. Tất cả yêu cầu đi qua shared/api/http.js, đủ trạng thái tải, lỗi và xung đột.
- Kiểm tra/bàn giao: Nhân viên xem/mở phiên được, người đại diện không mở được. Hai cửa sổ phản ánh cùng phiên thật; API lỗi không được báo thành công.

#### 1.3 — Yêu cầu, kiến trúc và review sprint
- Giờ: 8. Phụ thuộc: 1.1 FF; 1.2 FF; 1.4 FF; 1.5 FF.
- AC: Yêu cầu/kiến trúc 2 h đầu tuần 10 trước code; review/điều phối 4 h; sự kiện 2 h. Duyệt backlog và API v1.
- Đầu ra: Backlog/AC đã review; sơ đồ UI/API/DB; ranh giới mô đun và API v1; review và demo/retro.
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV1 — Lê Gia Hưng
Reviewer: Lại Quốc Bình An.

#### 1.4 — Dữ liệu tài khoản và kiểm tra quyền nền
- Giờ: 6. Phụ thuộc: —.
- AC: Có tài khoản thử cho hai người đại diện và nhân viên; API nhận diện được người gửi.
- Đầu ra: Schema User/PatientProfile/PatientAccess; seed giả lập; đăng nhập và middleware quyền.
- Vị trí: `server/src/modules/auth/`, `server/src/modules/patients/`, `server/src/shared/middleware/authenticate.js`, `database/migrations/001_identity.sql`.
- Cách ghép: Hưng đặt đăng nhập trong auth, danh sách/quyền hồ sơ trong patients. Thiết kế User, PatientProfile, PatientAccess và seed 001_identity.sql trong database/seeds. Cung cấp authenticate.js, require-staff.js và patients/patient-access.service.js dùng chung; phối hợp Trực đăng ký các route.
- Kiểm tra/bàn giao: API nhận đúng người gửi và vai trò; hai đại diện chung hồ sơ dùng cùng patientId. Gửi hợp đồng xác thực/quyền cho An, Đức Anh, Hoàng Anh, Đạt.

#### 1.5 — Đăng nhập và danh sách hồ sơ được phép
- Giờ: 6. Phụ thuộc: 1.4 FS.
- AC: Một người đại diện thấy đúng hồ sơ; xem hồ sơ ngoài quyền bị từ chối.
- Đầu ra: Giao diện đăng nhập; API hồ sơ được phép; kiểm thử quyền đọc.
- Vị trí: `client/src/features/auth/LoginPage.jsx`, `client/src/features/auth/auth.api.js`, `server/src/modules/patients/patient.routes.js`.
- Cách ghép: Hưng làm trang đăng nhập và API danh sách hồ sơ theo người gửi đã xác thực. Phối hợp Trực nối LoginPage vào app/routes.jsx; gửi Đạt cách dùng danh sách hồ sơ và trạng thái xác thực. Đạt giữ màn hình chọn hồ sơ trong patient.
- Kiểm tra/bàn giao: Chỉ trả hồ sơ được phép; thay patientId ngoài quyền bị từ chối. Kiểm tra điều hướng nhân viên/người đại diện và tình huống không có hồ sơ.

#### 1.6 — Yêu cầu mô đun, tài liệu và review
- Giờ: 8. Phụ thuộc: 1.4 FF; 1.5 FF; 1.7 FF; 1.8 FF.
- AC: Yêu cầu 1 h đầu tuần 10 trước code; tài liệu 1 h; review 4 h; sự kiện 2 h. Duyệt user stories/AC mô đun.
- Đầu ra: User stories/AC mô đun; tài liệu mô đun/API; review chéo; kiểm tra tích hợp; demo/retro.
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV2 — Lê Đức Anh
Reviewer: Lê Gia Hưng.

#### 1.7 — Dữ liệu phiếu và cấp số nền
- Giờ: 6. Phụ thuộc: 1.1 FS; 1.4 FS; 1.19 FS.
- AC: Lưu được phiếu WAITING, số không trùng; yêu cầu ngoài phiên hợp lệ bị từ chối.
- Đầu ra: Migration Ticket; ràng buộc; API cấp số nền; kiểm thử.
- Vị trí: `server/src/modules/tickets/ticket-issue.service.js`, `server/src/modules/tickets/ticket.repository.js`, `database/migrations/003_tickets.sql`, `database/migrations/004_ticket_events.sql`.
- Cách ghép: Đức Anh làm Ticket và cấp số nền sau 1.1, 1.4, 1.19. Ghép migration 003 và 004 theo thiết kế TicketEvent Trực đã bàn giao; Trực rà 004 trong giờ phối hợp. Dùng transaction.js, khóa phiên trước phiếu và helper append-ticket-event.js cùng giao dịch.
- Kiểm tra/bàn giao: Số duy nhất theo phiên, một phiếu hoạt động theo hồ sơ/phiên; lỗi hoàn tác cả phiếu và sự kiện. Bàn giao cấu trúc Ticket cho Hoàng Anh, Đạt và Trực.

#### 1.8 — API cấp số và xem phiếu riêng
- Giờ: 6. Phụ thuộc: 1.7 FS; 1.19 FS.
- AC: Người dùng lấy và xem đúng phiếu, vị trí bỏ qua phiếu đã hủy hoặc kết thúc.
- Đầu ra: API cấp và tra cứu phiếu riêng; vị trí chờ; nhật ký.
- Vị trí: `server/src/modules/tickets/ticket.routes.js`, `server/src/modules/tickets/ticket-query.service.js`.
- Cách ghép: Đức Anh nối API cấp và tra cứu phiếu riêng, kiểm tra quyền bằng patient-access.service.js. Cập nhật phản hồi trong openapi.yaml; cấp số dùng lại ticket-issue.service.js. Đạt dùng API này, Trực đọc dữ liệu cho API công khai riêng; không sao chép nghiệp vụ sang hai mô đun đó.
- Kiểm tra/bàn giao: Đọc đúng phiếu của hồ sơ được phép; vị trí không tính phiếu đã hủy/kết thúc. Xác nhận với Đạt trước khi 1.14 bắt đầu.

#### 1.9 — Yêu cầu mô đun, tài liệu và review
- Giờ: 8. Phụ thuộc: 1.7 FF; 1.8 FF; 1.10 FF; 1.11 FF.
- AC: Yêu cầu 1 h đầu tuần 10 trước code; tài liệu 1 h; review 4 h; sự kiện 2 h. Duyệt user stories/AC mô đun.
- Đầu ra: User stories/AC mô đun; tài liệu mô đun/API; review chéo; kiểm tra tích hợp; demo/retro.
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV3 — Hồ Sỹ Hoàng Anh
Reviewer: Lê Đức Anh.

#### 1.10 — Quy tắc trạng thái và gọi FIFO cơ bản
- Giờ: 6. Phụ thuộc: —.
- AC: Unit test phân biệt trạng thái hợp lệ, không hợp lệ và thứ tự FIFO.
- Đầu ra: Sơ đồ trạng thái; hàm chọn FIFO/quầy rảnh; unit test.
- Vị trí: `server/src/modules/queue/queue.rules.js`, `server/src/modules/queue/__tests__/queue.rules.test.js`, `docs/architecture/ticket-state-machine.md`.
- Cách ghép: Hoàng Anh định nghĩa FIFO, quầy rảnh/bận và chuyển trạng thái. Dùng dữ liệu thử để viết unit test trước khi ghép API; chốt sơ đồ với An, Đức Anh, Đạt, Trung. Trạng thái được thống nhất trong docs, không tự đặt bộ tên khác.
- Kiểm tra/bàn giao: Chọn WAITING sớm nhất còn hợp lệ; CALLED hoặc REGISTERING làm quầy bận. Cấm chuyển ngược trạng thái cuối và xử lý hàng rỗng rõ ràng.

#### 1.11 — API gọi lượt tích hợp
- Giờ: 6. Phụ thuộc: 1.10 FS; 1.7 FS; 1.19 FS.
- AC: Quầy rảnh gọi đúng phiếu; quầy bận không gọi thêm; TV5 thao tác được.
- Đầu ra: API danh sách chờ, lượt hiện tại, gọi tiếp; nhật ký và test.
- Vị trí: `server/src/modules/queue/queue.routes.js`, `server/src/modules/queue/queue.service.js`, `server/src/modules/queue/queue.repository.js`.
- Cách ghép: Hoàng Anh nối danh sách chờ, lượt hiện tại và gọi tiếp từ quy tắc 1.10 với Ticket 1.7/helper 1.19. Ghi cập nhật và sự kiện cùng giao dịch; dùng quyền nhân viên của Hưng. Phối hợp Trực đăng ký route và đưa hợp đồng cho Trung.
- Kiểm tra/bàn giao: Gọi đúng FIFO, quầy bận không gọi thêm; hai yêu cầu chỉ tạo một lượt chiếm quầy. Trung phải dùng được API thật ở 1.17.

#### 1.12 — Yêu cầu mô đun, tài liệu và review
- Giờ: 8. Phụ thuộc: 1.10 FF; 1.11 FF; 1.13 FF; 1.14 FF.
- AC: Yêu cầu 1 h đầu tuần 10 trước code; tài liệu 1 h; review 4 h; sự kiện 2 h. Duyệt user stories/AC mô đun.
- Đầu ra: User stories/AC mô đun; tài liệu mô đun/API; review chéo; kiểm tra tích hợp; demo/retro.
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV4 — Đặng Thành Đạt
Reviewer: Hồ Sỹ Hoàng Anh.

#### 1.13 — Thiết kế và dựng giao diện người bệnh
- Giờ: 6. Phụ thuộc: —.
- AC: Có màn hình đọc được trên điện thoại; phân biệt chờ, đang gọi và lỗi.
- Đầu ra: Wireframe và giao diện chọn hồ sơ/lấy số/xem phiếu dùng mock.
- Vị trí: `client/src/features/patient/PatientPage.jsx`, `client/src/features/patient/components/`, `client/src/features/patient/mocks/patient.mock.js`.
- Cách ghép: Đạt làm wireframe và UI chọn hồ sơ/lấy số/xem phiếu. Dùng mock khớp hợp đồng API và tách mock khỏi lớp gọi API. LoginPage do Hưng làm; phối hợp Trực đặt PatientPage vào routes.jsx. Wireframe lưu docs/design/patient/.
- Kiểm tra/bàn giao: Màn hình nhỏ đọc được; đổi hồ sơ không giữ phiếu cũ; WAITING, CALLED, tải và lỗi phân biệt bằng chữ. Ghi rõ bằng chứng ở bước này dùng mock.

#### 1.14 — Kết nối luồng lấy số và xem phiếu
- Giờ: 6. Phụ thuộc: 1.13 FS; 1.5 FS; 1.8 FS.
- AC: Demo đăng nhập, chọn hồ sơ, lấy và xem phiếu bằng dữ liệu thật trong PostgreSQL.
- Đầu ra: Luồng người bệnh kết nối API thật và dữ liệu PostgreSQL.
- Vị trí: `client/src/features/patient/patient.api.js`, `client/src/features/patient/PatientPage.jsx`, `tests/e2e/patient-flow.spec.js`.
- Cách ghép: Sau 1.5 và 1.8, Đạt thay nguồn mock bằng API thật qua http.js. Chọn hồ sơ từ Hưng, lấy/đọc phiếu từ Đức Anh; xóa trạng thái cũ khi đổi hồ sơ. Bổ sung E2E nền trong bộ công cụ Trực đã thống nhất, không mở project frontend khác.
- Kiểm tra/bàn giao: Đăng nhập → chọn hồ sơ → lấy/xem số trên PostgreSQL thật. Reload không tạo phiếu mới; lỗi mạng hoặc ngoài quyền không làm UI báo thành công giả.

#### 1.15 — Yêu cầu mô đun, tài liệu và review
- Giờ: 8. Phụ thuộc: 1.13 FF; 1.14 FF; 1.16 FF; 1.17 FF.
- AC: Yêu cầu 1 h đầu tuần 10 trước code; tài liệu 1 h; review 4 h; sự kiện 2 h. Duyệt user stories/AC mô đun.
- Đầu ra: User stories/AC mô đun; tài liệu mô đun/API; review chéo; kiểm tra tích hợp; demo/retro.
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV5 — Trần Quang Trung
Reviewer: Đặng Thành Đạt.

#### 1.16 — Thiết kế màn hình vận hành quầy
- Giờ: 6. Phụ thuộc: —.
- AC: Nhân viên phân biệt được danh sách chờ và lượt đang được gọi.
- Đầu ra: Wireframe và giao diện nhân viên với dữ liệu mock.
- Vị trí: `client/src/features/staff/StaffPage.jsx`, `client/src/features/staff/components/`, `client/src/features/staff/mocks/staff.mock.js`.
- Cách ghép: Trung dựng UI quầy gồm hàng chờ, lượt hiện tại, thao tác gọi. Dành vị trí import SessionPanel của An, không viết lại phần phiên. Mock khớp hợp đồng Hoàng Anh; wireframe lưu docs/design/staff/. Phối hợp Trực ghép route nhân viên.
- Kiểm tra/bàn giao: Phân biệt hàng chờ/lượt hiện tại, quầy bận/rảnh và hàng rỗng. Nút cùng thông báo khớp sơ đồ trạng thái, chưa ghi mock là API thật.

#### 1.17 — Kết nối gọi lượt cơ bản
- Giờ: 6. Phụ thuộc: 1.16 FS; 1.11 FS; 1.4 FS.
- AC: Gọi số từ giao diện đổi trạng thái thật trong cơ sở dữ liệu.
- Đầu ra: Màn hình danh sách/lượt hiện tại/gọi số kết nối API thật.
- Vị trí: `client/src/features/staff/staff.api.js`, `client/src/features/staff/StaffPage.jsx`, `tests/e2e/staff-flow.spec.js`.
- Cách ghép: Trung nối UI từ 1.16 với API 1.11 qua http.js và quyền 1.4. Sau thao tác đọc lại dữ liệu máy chủ, khóa nút đang gửi. Dùng bản client/server/DB chung với Đạt và Hoàng Anh, không giữ dữ liệu số lượt riêng trong trình duyệt.
- Kiểm tra/bàn giao: Lấy số thật rồi gọi từ UI làm Ticket đổi CALLED trong DB. Hai cửa sổ xung đột phải tải lại; tài khoản thường không vận hành quầy được.

#### 1.18 — Yêu cầu mô đun, tài liệu và review
- Giờ: 8. Phụ thuộc: 1.16 FF; 1.17 FF; 1.19 FF; 1.20 FF.
- AC: Yêu cầu 1 h đầu tuần 10 trước code; tài liệu 1 h; review 4 h; sự kiện 2 h. Duyệt user stories/AC mô đun.
- Đầu ra: User stories/AC mô đun; tài liệu mô đun/API; review chéo; kiểm tra tích hợp; demo/retro.
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV6 — Phan Trung Trực
Reviewer: Trần Quang Trung.

#### 1.19 — Khung dự án và hàm nhật ký dùng chung
- Giờ: 6. Phụ thuộc: —.
- AC: Nhóm khởi động được khung; helper nhận cùng giao dịch, không tự commit riêng.
- Đầu ra: Repo và khung chạy React/Express/PostgreSQL; helper TicketEvent cùng giao dịch.
- Vị trí: `client/src/app/`, `client/src/shared/api/http.js`, `server/src/app/`, `server/src/shared/db/`, `server/src/modules/audit/append-ticket-event.js`.
- Cách ghép: Trực dựng khung React/Express/PostgreSQL, README, cấu hình mẫu và lệnh chạy/test; Hưng phối hợp phần xác thực trong http.js. Chốt thiết kế TicketEvent tại docs/architecture/ticket-event.md và giao diện helper. Kiểm tra helper bằng test double khi Ticket chưa có; 1.7 ghép DDL và test DB thật.
- Kiểm tra/bàn giao: Clone mới chạy được khung; helper nhận đối tượng giao dịch từ nghiệp vụ và không tự commit. Bàn giao sớm; không chờ hoàn tất mọi màn hình/API mới ghép khung.

#### 1.20 — Bảng gọi số và API công khai cơ bản
- Giờ: 6. Phụ thuộc: 1.19 FS; 1.8 FS; 1.11 FS.
- AC: Bảng hiển thị số lấy từ API; phản hồi không có tên, mã hồ sơ hay thông tin sức khỏe.
- Đầu ra: API và bảng gọi số công khai không có danh tính.
- Vị trí: `server/src/modules/public-board/`, `client/src/features/public-board/PublicBoardPage.jsx`, `client/src/features/public-board/public-board.api.js`.
- Cách ghép: Trực làm API công khai riêng chỉ trả trường được phép, rồi nối bảng React bằng API thật sau 1.8 và 1.11. Ghép route vào khung chung. Không trả nguyên Ticket hoặc PatientProfile rồi chỉ ẩn danh tính bằng UI.
- Kiểm tra/bàn giao: Số khớp lượt được gọi; JSON không chứa tên, patientId hay dữ liệu sức khỏe. Trung đối chiếu bảng quầy, Hưng hỗ trợ rà trường công khai.

#### 1.21 — Yêu cầu mô đun, tài liệu và review
- Giờ: 8. Phụ thuộc: 1.19 FF; 1.20 FF; 1.1 FF; 1.2 FF.
- AC: Yêu cầu 1 h đầu tuần 10 trước code; tài liệu 1 h; review 4 h; sự kiện 2 h. Duyệt user stories/AC mô đun.
- Đầu ra: User stories/AC mô đun; tài liệu mô đun/API; review chéo; kiểm tra tích hợp; demo/retro.
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

## Sprint 2 — Tuần 12–13

### Leader — Lại Quốc Bình An
Reviewer: Phan Trung Trực.

#### 2.1 — Ngừng cấp số và điều kiện đóng phiên
- Giờ: 6. Phụ thuộc: 1.2 FS; 1.8 FS.
- AC: Ngừng cấp số mới nhưng vẫn xử lý phiếu cũ; còn phiếu hoạt động thì chưa đóng.
- Đầu ra: API ngừng nhận số/đóng phiên; kiểm thử điều kiện đóng.
- Vị trí: `server/src/modules/sessions/session.service.js`, `server/src/modules/sessions/session.routes.js`, `server/src/modules/sessions/__tests__/session-lifecycle.test.js`.
- Cách ghép: An mở rộng mô đun phiên hiện có để STOPPED ngừng cấp nhưng xử lý phiếu cũ, CLOSED chỉ khi hết phiếu hoạt động. Dùng cùng transaction/khóa phiên với Đức Anh, Hoàng Anh, Đạt; cập nhật openapi.yaml.
- Kiểm tra/bàn giao: Cấp sau STOPPED bị từ chối; còn WAITING/CALLED/REGISTERING thì chưa đóng. Gửi điều kiện và lỗi cho Đức Anh, Đạt, Trung để nối tuần 13.

#### 2.2 — Hoàn thiện quản lý phiên trên giao diện
- Giờ: 6. Phụ thuộc: 2.1 FS; 2.11 FF; 2.13 FS.
- AC: Trạng thái phiên và quyền thao tác nhất quán giữa API và giao diện.
- Đầu ra: Giao diện quản lý phiên đầy đủ; bộ ca ngừng/cấp/hủy đồng thời.
- Vị trí: `client/src/features/sessions/SessionPanel.jsx`, `client/src/features/sessions/session.api.js`, `tests/e2e/session-flow.spec.js`.
- Cách ghép: An bổ sung ngừng/đóng trong SessionPanel đã được Trung import. Nối 2.1, phối hợp hủy 2.13 và ghi vắng 2.11 theo phụ thuộc Excel. Không tạo trang quản lý phiên thứ hai hoặc tự suy ra CLOSED từ nút bấm.
- Kiểm tra/bàn giao: UI khớp server; STOPPED vẫn xử lý phiếu cũ; đóng còn phiếu bị từ chối. Trung chạy lại phần phiên trong toàn màn hình quầy.

#### 2.3 — Thiết kế, điều phối và review sprint
- Giờ: 8. Phụ thuộc: 2.1 FF; 2.2 FF; 2.4 FF; 2.5 FF.
- AC: Tài liệu 2 giờ; phối hợp/review 4 giờ; sự kiện 2 giờ. Có bằng chứng.
- Đầu ra: Tài liệu cập nhật; review; kiểm tra tích hợp; demo/retro
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV1 — Lê Gia Hưng
Reviewer: Lại Quốc Bình An.

#### 2.4 — Áp dụng quyền cho toàn bộ nghiệp vụ
- Giờ: 6. Phụ thuộc: 1.5 FS; 1.8 FS; 1.11 FS.
- AC: API lấy, xem, hủy và API nhân viên có kiểm tra quyền ở máy chủ.
- Đầu ra: Middleware quyền dùng chung và kiểm thử trên từng API nghiệp vụ.
- Vị trí: `server/src/shared/middleware/authenticate.js`, `server/src/shared/middleware/require-staff.js`, `server/src/modules/patients/patient-access.service.js`.
- Cách ghép: Hưng chuẩn hóa quyền dùng chung và phối hợp từng chủ API gắn vào luồng của họ. Rà routes/controllers của sessions, tickets, queue; không tự sửa nghiệp vụ người khác. Đạt cùng tích hợp kiểm tra quyền vào hủy 2.13.
- Kiểm tra/bàn giao: API lấy/xem/hủy và API nhân viên đều kiểm tra server; sửa userId/role/patientId không tăng quyền. Ghi ma trận tại docs/testing/cases/2-4.md.

#### 2.5 — Kiểm thử quyền với nhiều người đại diện
- Giờ: 6. Phụ thuộc: 2.4 FS; 2.13 FS.
- AC: Quyền đúng theo mã hồ sơ; dữ liệu giữa các tài khoản không lẫn nhau.
- Đầu ra: Bộ ca nhiều người đại diện; kiểm thử đăng xuất.
- Vị trí: `server/tests/integration/patient-access.test.js`, `database/seeds/001_identity.sql`, `docs/testing/cases/2-5.md`.
- Cách ghép: Hưng mở rộng dữ liệu thử hai đại diện chung hồ sơ và hồ sơ riêng; chạy ma trận tài khoản × hồ sơ × thao tác với hủy 2.13. Phối hợp Đạt/Trung xử lý đăng xuất và chuyển tài khoản theo một cơ chế chung.
- Kiểm tra/bàn giao: Đúng quyền theo patientId; người ngoài quyền bị từ chối với dữ liệu không đổi. Không giữ nội dung riêng của tài khoản cũ sau chuyển tài khoản.

#### 2.6 — Tài liệu, review chéo và sự kiện sprint
- Giờ: 8. Phụ thuộc: 2.4 FF; 2.5 FF; 2.7 FF; 2.8 FF.
- AC: Tài liệu 2 giờ; phối hợp/review 4 giờ; sự kiện 2 giờ. Có bằng chứng.
- Đầu ra: Tài liệu cập nhật; review; kiểm tra tích hợp; demo/retro
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV2 — Lê Đức Anh
Reviewer: Lê Gia Hưng.

#### 2.7 — Yêu cầu gửi lại không sinh phiếu mới
- Giờ: 6. Phụ thuộc: 1.8 FS.
- AC: Cùng khóa và dữ liệu trả cùng phiếu; cùng khóa khác dữ liệu báo xung đột.
- Đầu ra: Xử lý requestId và dữ liệu xung đột; kiểm thử gửi lại.
- Vị trí: `server/src/modules/tickets/ticket-issue.service.js`, `server/src/modules/tickets/ticket-request.repository.js`, `client/src/features/patient/patient.api.js`.
- Cách ghép: Đức Anh triển khai requestId ở tickets; tệp patient.api.js do Đạt cập nhật theo hợp đồng đã thống nhất. Quy tắc khóa là người gửi + requestId, đối chiếu nội dung; kiểm tra quyền trước trả lại phiếu. Nếu cần thay DB, đăng ký migration mới với An/Trực.
- Kiểm tra/bàn giao: Cùng khóa/nội dung trả cùng phiếu kể cả đã kết thúc; khác nội dung báo 409. Đức Anh đưa hướng xử lý gửi lại, Đạt tự sửa client và giữ requestId cùng thao tác.

#### 2.8 — Kiểm tra đồng thời và ngừng nhận số
- Giờ: 6. Phụ thuộc: 2.7 FS; 2.1 FS.
- AC: Không cấp khi phiên ngừng nhận số; không tạo hai phiếu hoạt động cho cùng người bệnh.
- Đầu ra: Giao dịch cấp số tích hợp trạng thái phiên và phiếu.
- Vị trí: `server/src/modules/tickets/ticket-issue.service.js`, `server/src/modules/tickets/ticket.repository.js`, `server/tests/integration/ticket-concurrency.test.js`.
- Cách ghép: Đức Anh tích hợp requestId 2.7 với trạng thái phiên 2.1. Khóa QueueSession trước rồi Ticket; dùng ràng buộc DB bảo vệ số duy nhất và một phiếu hoạt động. Cơ chế ngừng cấp do An cung cấp, không tạo bản trạng thái riêng trong tickets.
- Kiểm tra/bàn giao: Hai đại diện chung hồ sơ chỉ có một phiếu hoạt động; STOPPED không cấp mới. Kiểm tra dữ liệu cuối, phản hồi và sự kiện sau các yêu cầu cạnh tranh.

#### 2.9 — Tài liệu, review chéo và sự kiện sprint
- Giờ: 8. Phụ thuộc: 2.7 FF; 2.8 FF; 2.10 FF; 2.11 FF.
- AC: Tài liệu 2 giờ; phối hợp/review 4 giờ; sự kiện 2 giờ. Có bằng chứng.
- Đầu ra: Tài liệu cập nhật; review; kiểm tra tích hợp; demo/retro
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV3 — Hồ Sỹ Hoàng Anh
Reviewer: Lê Đức Anh.

#### 2.10 — Gọi lại và tiếp nhận đến hoàn tất
- Giờ: 6. Phụ thuộc: 1.11 FS.
- AC: Đúng vòng đời; gọi lại giữ mã phiếu; hoàn tất giải phóng quầy.
- Đầu ra: API gọi lại/bắt đầu/hoàn tất; kiểm thử chuyển trạng thái.
- Vị trí: `server/src/modules/queue/queue.routes.js`, `server/src/modules/queue/queue.service.js`, `server/src/modules/queue/queue.rules.js`.
- Cách ghép: Hoàng Anh mở rộng queue hiện có: gọi lại giữ số/phiếu và đổi thời điểm gọi gần nhất; bắt đầu CALLED → REGISTERING, hoàn tất → COMPLETED. Dùng helper sự kiện cùng giao dịch; gửi hợp đồng cho Trung làm 2.16 song song.
- Kiểm tra/bàn giao: Hoàn tất giải phóng quầy; chuyển sai trạng thái bị từ chối. Không tạo phiếu mới khi gọi lại và không diễn giải COMPLETED là khám bệnh xong.

#### 2.11 — Ghi vắng và kiểm tra ranh giới thời gian
- Giờ: 6. Phụ thuộc: 2.10 FS; 2.1 FS; 2.13 FS.
- AC: Trước T bị từ chối; gọi lại bắt đầu tính T mới; chuyển trạng thái không chồng nhau.
- Đầu ra: API ghi vắng; kiểm thử trước/sau T và hủy/gọi đồng thời.
- Vị trí: `server/src/modules/queue/queue.service.js`, `server/src/shared/config/env.js`, `server/src/modules/queue/__tests__/no-show.test.js`.
- Cách ghép: Hoàng Anh thêm ghi vắng CALLED sau đủ T từ lần gọi gần nhất; đọc T từ cấu hình chung, không đặt hằng số riêng ở nhiều tệp. Thời gian server quyết định; nhân viên chủ động thao tác. Phối hợp Đạt thử hủy/gọi và Trung hiển thị T.
- Kiểm tra/bàn giao: Trước T bị từ chối, đúng/sau T được phép nếu còn CALLED; gọi lại tính T mới. Test dùng thời gian kiểm soát được, không bắt người chạy chờ lâu.

#### 2.12 — Tài liệu, review chéo và sự kiện sprint
- Giờ: 8. Phụ thuộc: 2.10 FF; 2.11 FF; 2.13 FF; 2.14 FF.
- AC: Tài liệu 2 giờ; phối hợp/review 4 giờ; sự kiện 2 giờ. Có bằng chứng.
- Đầu ra: Tài liệu cập nhật; review; kiểm tra tích hợp; demo/retro
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV4 — Đặng Thành Đạt
Reviewer: Hồ Sỹ Hoàng Anh.

#### 2.13 — API hủy phiếu và kiểm thử quyền
- Giờ: 6. Phụ thuộc: 1.14 FS; 1.8 FS; 1.19 FS.
- AC: Chỉ người có quyền hủy phiếu còn chờ; không hủy được phiếu đã gọi.
- Đầu ra: API hủy WAITING có kiểm tra quyền và sự kiện; test.
- Vị trí: `server/src/modules/tickets/ticket-cancel.service.js`, `server/src/modules/tickets/ticket.routes.js`, `server/tests/integration/ticket-cancel.test.js`.
- Cách ghép: Đạt tự làm nghiệp vụ hủy trong tickets, dùng Ticket của Đức Anh, quyền của Hưng và helper Trực. Đăng ký thao tác hủy trong ticket.routes.js bằng PR báo Đức Anh; không dựng mô đun dữ liệu Ticket thứ hai. Giữ trạng thái và sự kiện cùng giao dịch.
- Kiểm tra/bàn giao: Chỉ đại diện có quyền hủy WAITING; đã gọi thì từ chối. Gọi/hủy đồng thời chỉ có trạng thái cuối hợp lệ; An nhận kết quả để thử đóng phiên.

#### 2.14 — Giao diện hủy và cập nhật trạng thái
- Giờ: 6. Phụ thuộc: 2.13 FS; 2.11 FF.
- AC: Sau hủy hiển thị đúng; vị trí cập nhật; mất mạng không hiển thị như vừa đồng bộ.
- Đầu ra: Giao diện hủy, polling 3 giây, báo mất mạng và xử lý xung đột.
- Vị trí: `client/src/features/patient/PatientPage.jsx`, `client/src/features/patient/patient.api.js`, `client/src/features/patient/usePatientTicket.js`.
- Cách ghép: Đạt nối nút hủy với 2.13, thêm polling 3 giây và dấu hiệu mất mạng; dọn polling khi đổi hồ sơ/rời trang. Dùng requestId theo 2.7 của Đức Anh. Dữ liệu phiếu/vị trí lấy từ API; không tính quy tắc hàng chờ lại trong UI.
- Kiểm tra/bàn giao: Hủy thành công hiển thị CANCELLED; vừa gọi thì tải trạng thái mới. Mất mạng ghi rõ dữ liệu cũ; cùng thao tác thử lại không tạo phiếu trùng.

#### 2.15 — Tài liệu, review chéo và sự kiện sprint
- Giờ: 8. Phụ thuộc: 2.13 FF; 2.14 FF; 2.16 FF; 2.17 FF.
- AC: Tài liệu 2 giờ; phối hợp/review 4 giờ; sự kiện 2 giờ. Có bằng chứng.
- Đầu ra: Tài liệu cập nhật; review; kiểm tra tích hợp; demo/retro
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV5 — Trần Quang Trung
Reviewer: Đặng Thành Đạt.

#### 2.16 — Giao diện đầy đủ thao tác tiếp nhận
- Giờ: 6. Phụ thuộc: 1.17 FS; 2.10 FF.
- AC: Nhân viên hoàn thành được một lượt; gọi lại không sinh số mới.
- Đầu ra: Giao diện gọi lại/bắt đầu/hoàn tất kết nối API.
- Vị trí: `client/src/features/staff/StaffPage.jsx`, `client/src/features/staff/staff.api.js`, `client/src/features/staff/components/CurrentTicket.jsx`.
- Cách ghép: Trung nối gọi lại/bắt đầu/hoàn tất theo API Hoàng Anh ở 2.10. Có thể dựng UI bằng mock theo hợp đồng khi làm song song FF, sau đó thay bằng API thật. Tiếp tục import SessionPanel của An, dùng http.js chung.
- Kiểm tra/bàn giao: Một lượt đi từ CALLED qua REGISTERING đến COMPLETED, quầy rảnh mới gọi tiếp. Gọi lại giữ số; API từ chối thì UI không báo thành công.

#### 2.17 — Giao diện ghi vắng và xử lý xung đột
- Giờ: 6. Phụ thuộc: 2.16 FS; 2.11 FF; 2.2 FF.
- AC: Không báo hoàn tất giả khi API từ chối; hai màn hình nhân viên không làm lệch quầy.
- Đầu ra: Giao diện ghi vắng, thời gian T, lỗi và tải lại trạng thái.
- Vị trí: `client/src/features/staff/StaffPage.jsx`, `client/src/features/staff/staff.api.js`, `tests/e2e/staff-conflict.spec.js`.
- Cách ghép: Trung bổ sung ghi vắng và xung đột hai cửa sổ; dùng lần gọi gần nhất/T từ hợp đồng server. Đồng bộ phần phiên 2.2 và ghi vắng 2.11 trước nghiệm thu theo FF; tải lại dữ liệu sau từ chối.
- Kiểm tra/bàn giao: Trước T không báo NO_SHOW; gọi lại tính thời gian mới; hai cửa sổ không làm UI lệch server. STOPPED vẫn tiếp nhận phiếu cũ và đóng sai điều kiện bị báo rõ.

#### 2.18 — Tài liệu, review chéo và sự kiện sprint
- Giờ: 8. Phụ thuộc: 2.16 FF; 2.17 FF; 2.19 FF; 2.20 FF.
- AC: Tài liệu 2 giờ; phối hợp/review 4 giờ; sự kiện 2 giờ. Có bằng chứng.
- Đầu ra: Tài liệu cập nhật; review; kiểm tra tích hợp; demo/retro
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV6 — Phan Trung Trực
Reviewer: Trần Quang Trung.

#### 2.19 — Hoàn thiện nhật ký và bảo vệ dữ liệu công khai
- Giờ: 6. Phụ thuộc: 1.20 FS; 2.10 FF; 2.13 FF.
- AC: Sự kiện có người, thời điểm, hành động; bảng chỉ có dữ liệu đã cho phép.
- Đầu ra: Nhật ký nghiệp vụ đã tích hợp; bảng polling và báo mất mạng.
- Vị trí: `server/src/modules/audit/append-ticket-event.js`, `server/src/modules/public-board/`, `client/src/features/public-board/`.
- Cách ghép: Trực rà nơi các chủ API gọi helper và nhật ký hành động; chủ nghiệp vụ tự sửa điểm gọi trong mô đun của mình. Hoàn thiện phản hồi công khai chỉ chứa trường cho phép, polling 3 giây và báo mất mạng trên bảng.
- Kiểm tra/bàn giao: Cấp/gọi/gọi lại/bắt đầu/hoàn tất/hủy/ghi vắng có sự kiện đúng; rollback không để sự kiện thành công riêng. JSON công khai không lộ danh tính.

#### 2.20 — Kiểm tra tự động và môi trường tích hợp
- Giờ: 6. Phụ thuộc: 2.19 FS; 2.16 FS.
- AC: Mã nguồn có thể cài và chạy lại theo README; không ghi mật khẩu thật trong repo.
- Đầu ra: Lệnh build/test; seed; môi trường demo; E2E nền.
- Vị trí: `README.md`, `database/seeds/`, `tests/e2e/`, `client/package.json`, `server/package.json`.
- Cách ghép: Trực tổng hợp lệnh chạy/build/test đã dùng thật, migration/seed và môi trường demo. Ghép test do các chủ mô đun cung cấp; một E2E nền kiểm tra lấy số → gọi → tiếp nhận. Nếu dùng CI thì cấu hình rõ phần thực sự chạy, không mặc định đã có CI.
- Kiểm tra/bàn giao: Một bạn clone mới, tạo DB thử sạch và chạy được theo README. Không cần tệp bí mật ngoài cấu hình hướng dẫn; không push .env hoặc node_modules.

#### 2.21 — Tài liệu, review chéo và sự kiện sprint
- Giờ: 8. Phụ thuộc: 2.19 FF; 2.20 FF; 2.1 FF; 2.2 FF.
- AC: Tài liệu 2 giờ; phối hợp/review 4 giờ; sự kiện 2 giờ. Có bằng chứng.
- Đầu ra: Tài liệu cập nhật; review; kiểm tra tích hợp; demo/retro
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

## Sprint 3 — Tuần 14–15

### Leader — Lại Quốc Bình An
Reviewer: Phan Trung Trực.

#### 3.1 — Kiểm thử toàn bộ vòng đời phiên
- Giờ: 6. Phụ thuộc: 2.2 FS.
- AC: Phiên mới có dãy số riêng; không tạo hai phiên chưa đóng.
- Đầu ra: Bộ kiểm thử vòng đời phiên và mở phiên mới.
- Vị trí: `server/src/modules/sessions/__tests__/session-lifecycle.test.js`, `tests/e2e/session-flow.spec.js`, `docs/testing/cases/3-1.md`.
- Cách ghép: An mở rộng bộ test phiên có sẵn cho mở/ngừng/xử lý hết phiếu/đóng/mở mới. Dùng DB thử và ghi commit, dữ liệu đầu cùng kết quả; phối hợp cấp/ngừng với Đức Anh và hủy phiếu cuối với Đạt.
- Kiểm tra/bàn giao: Chỉ một phiên chưa đóng; còn phiếu hoạt động không đóng được; phiên mới có dãy số riêng. Tạo Issue lỗi, gắn 3.1 để sửa ở 3.2.

#### 3.2 — Sửa lỗi mô đun phiên và chốt bàn giao
- Giờ: 6. Phụ thuộc: 3.1 FS.
- AC: Mô đun phiên đạt tiêu chí hoàn thành, có bằng chứng và không còn lỗi chặn.
- Đầu ra: Mô đun phiên đã sửa lỗi; tài liệu; bằng chứng hồi quy.
- Vị trí: `server/src/modules/sessions/`, `client/src/features/sessions/`, `docs/modules/sessions.md`.
- Cách ghép: An sửa đúng tệp phiên cũ, bổ sung test tái hiện lỗi và chạy hồi quy. Nếu thay API/schema thì cập nhật hợp đồng/migration theo quy định, báo Trung và Đức Anh. Trực review PR của An trước merge.
- Kiểm tra/bàn giao: Bàn giao main đã sửa và bằng chứng trước hết thứ tư tuần 15. Không còn lỗi chặn mô đun phiên; Trực dùng đúng commit đó cho 3.20.

#### 3.3 — Điều phối, nghiệm thu và chốt bản cuối
- Giờ: 8. Phụ thuộc: 3.2 FF; 3.5 FF; 3.8 FF; 3.11 FF; 3.14 FF; 3.17 FF; 3.20 FF.
- AC: Thứ 5-6 tuần 15, An duyệt sau sửa lỗi, test toàn luồng và cài sạch. Tài liệu 2 h; điều phối/nghiệm thu 4 h; sự kiện 2 h.
- Đầu ra: Checklist nghiệm thu; báo cáo test cuối; bản demo được duyệt; ghi nhận review/retro.
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV1 — Lê Gia Hưng
Reviewer: Lại Quốc Bình An.

#### 3.4 — Ma trận kiểm thử truy cập trái quyền
- Giờ: 6. Phụ thuộc: 2.5 FS.
- AC: Truy cập trái phép bị từ chối; không làm thay đổi dữ liệu.
- Đầu ra: Ma trận và kết quả kiểm thử truy cập trái quyền.
- Vị trí: `server/tests/integration/patient-access.test.js`, `docs/testing/cases/3-4.md`, `docs/testing/evidence/3-4/`.
- Cách ghép: Hưng hoàn thiện ma trận quyền trên các API tích hợp; thử trực tiếp API với user/patient/ticket/session khác nhau. Kiểm tra dữ liệu trước/sau và JSON công khai; không chỉ nhìn nút bị ẩn.
- Kiểm tra/bàn giao: Trái quyền bị từ chối và không đổi dữ liệu. Gửi lỗi về đúng chủ API, ghi ca tái hiện và mức ảnh hưởng; phần quyền chung sửa ở 3.5.

#### 3.5 — Sửa lỗi quyền và tài khoản phục vụ demo
- Giờ: 6. Phụ thuộc: 3.4 FS.
- AC: Tất cả vai trò đăng nhập được; quyền đúng trên bản demo cuối.
- Đầu ra: Mô đun quyền đã sửa lỗi; tài khoản demo; hướng dẫn vai trò.
- Vị trí: `server/src/modules/auth/`, `server/src/modules/patients/`, `server/src/shared/middleware/`, `database/seeds/001_identity.sql`.
- Cách ghép: Hưng sửa lỗi quyền trong các thành phần hiện có, chạy lại ma trận và cập nhật docs/modules/auth.md. Chốt tài khoản giả lập từ seed; phối hợp Đạt/Trung thử đăng nhập trên UI bản main, không tạo cơ chế tài khoản demo riêng.
- Kiểm tra/bàn giao: Bàn giao trước hết thứ tư tuần 15; mọi vai trò hoạt động đúng, hai đại diện dùng hồ sơ chung hợp lệ. Trực nhận seed và hướng dẫn quyền cho 3.20.

#### 3.6 — Tài liệu, review chéo và sự kiện sprint
- Giờ: 8. Phụ thuộc: 3.4 FF; 3.5 FF; 3.7 FF; 3.8 FF.
- AC: Tài liệu 2 giờ; phối hợp/review 4 giờ; sự kiện 2 giờ. Có bằng chứng.
- Đầu ra: Tài liệu cập nhật; review; kiểm tra tích hợp; demo/retro
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV2 — Lê Đức Anh
Reviewer: Lê Gia Hưng.

#### 3.7 — Kiểm thử 20 yêu cầu và nhiều người đại diện
- Giờ: 6. Phụ thuộc: 2.8 FS.
- AC: Số trong phiên không trùng; cùng hồ sơ chỉ có một phiếu hoạt động.
- Đầu ra: Kịch bản 20 yêu cầu, hai đại diện, gửi lại và báo cáo kết quả.
- Vị trí: `server/tests/integration/ticket-concurrency.test.js`, `docs/testing/cases/3-7.md`, `docs/testing/evidence/3-7/`.
- Cách ghép: Đức Anh mở rộng bộ thử 20 yêu cầu: nhiều hồ sơ, hai đại diện chung hồ sơ, gửi lại cùng khóa và khóa xung đột. Lưu cấu hình, phản hồi và truy vấn dữ liệu cuối; dữ liệu thử tách môi trường nhóm.
- Kiểm tra/bàn giao: Số không trùng và tối đa một phiếu hoạt động mỗi hồ sơ/phiên. Báo lỗi thật cho 3.8; xung đột nghiệp vụ hợp lệ không bị tính nhầm thành lỗi server.

#### 3.8 — Sửa lỗi cấp số và lưu bền dữ liệu
- Giờ: 6. Phụ thuộc: 3.7 FS.
- AC: Không mất phiếu, không dùng lại số; giao dịch lỗi không để lại dữ liệu dở dang.
- Đầu ra: Mô đun cấp số đã sửa lỗi; kiểm thử lưu bền và rollback.
- Vị trí: `server/src/modules/tickets/`, `server/tests/integration/ticket-persistence.test.js`, `docs/modules/tickets.md`.
- Cách ghép: Đức Anh sửa trong tickets, thêm test lỗi rồi chạy lại đồng thời/gửi lại. Thử restart API không reset DB; thử lỗi giữa giao dịch để kiểm tra rollback. Migration sửa schema phải là tệp mới nếu bản cũ đã áp dụng.
- Kiểm tra/bàn giao: Phiếu/lịch sử còn sau restart, số đã cấp không dùng lại, rollback không để dữ liệu dở dang. Bàn giao trước hết thứ tư tuần 15 cho Trực chạy 3.20.

#### 3.9 — Tài liệu, review chéo và sự kiện sprint
- Giờ: 8. Phụ thuộc: 3.7 FF; 3.8 FF; 3.10 FF; 3.11 FF.
- AC: Tài liệu 2 giờ; phối hợp/review 4 giờ; sự kiện 2 giờ. Có bằng chứng.
- Đầu ra: Tài liệu cập nhật; review; kiểm tra tích hợp; demo/retro
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV3 — Hồ Sỹ Hoàng Anh
Reviewer: Lê Đức Anh.

#### 3.10 — Kiểm thử gọi đồng thời và ngoại lệ
- Giờ: 6. Phụ thuộc: 2.11 FS.
- AC: Chỉ một lượt chiếm quầy; mọi kết quả giữ đúng trạng thái và lịch sử.
- Đầu ra: Bộ ca gọi đồng thời, hàng rỗng và ngoại lệ.
- Vị trí: `server/tests/integration/queue-concurrency.test.js`, `server/src/modules/queue/__tests__/no-show.test.js`, `docs/testing/cases/3-10.md`.
- Cách ghép: Hoàng Anh thử gọi/gọi, gọi/hủy, bắt đầu/ghi vắng và gọi lại/ghi vắng. Dùng quy tắc và bộ test hiện có; kiểm tra Ticket lẫn TicketEvent. Trung hỗ trợ hai cửa sổ, Đạt hỗ trợ hủy.
- Kiểm tra/bàn giao: Một lượt chiếm quầy; FIFO và T đúng; trạng thái cuối không chuyển ngược. Ghi Issue có bước tái hiện cho 3.11, không tạo bộ quy tắc test tách rời API.

#### 3.11 — Sửa lỗi quy tắc và kiểm thử hồi quy
- Giờ: 6. Phụ thuộc: 3.10 FS.
- AC: Không còn lỗi chặn luồng tiếp nhận; TV5 dùng API ổn định trên bản demo.
- Đầu ra: Mô đun tiếp nhận đã sửa lỗi; bằng chứng hồi quy.
- Vị trí: `server/src/modules/queue/`, `docs/architecture/ticket-state-machine.md`, `docs/modules/queue.md`.
- Cách ghép: Hoàng Anh sửa queue, chạy lại unit/integration test và phối hợp Trung thử API từ UI thật. Cập nhật mô tả trạng thái/API khi thay đổi đã được An và bên nhận thống nhất.
- Kiểm tra/bàn giao: Không còn lỗi chặn tiếp nhận; bằng chứng đúng bản main. Hoàn thành trước hết thứ tư tuần 15, gửi Trực các ca hồi quy quan trọng.

#### 3.12 — Tài liệu, review chéo và sự kiện sprint
- Giờ: 8. Phụ thuộc: 3.10 FF; 3.11 FF; 3.13 FF; 3.14 FF.
- AC: Tài liệu 2 giờ; phối hợp/review 4 giờ; sự kiện 2 giờ. Có bằng chứng.
- Đầu ra: Tài liệu cập nhật; review; kiểm tra tích hợp; demo/retro
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV4 — Đặng Thành Đạt
Reviewer: Hồ Sỹ Hoàng Anh.

#### 3.13 — Kiểm thử người dùng trên trình duyệt
- Giờ: 6. Phụ thuộc: 2.14 FS.
- AC: Không thao tác nhầm hồ sơ; nút và thông báo đúng trạng thái từ API.
- Đầu ra: Kết quả E2E người dùng, màn hình nhỏ, gửi lại, hủy và mất mạng.
- Vị trí: `tests/e2e/patient-flow.spec.js`, `client/src/features/patient/__tests__/`, `docs/testing/cases/3-13.md`.
- Cách ghép: Đạt mở rộng E2E người bệnh trên API thật: đổi hồ sơ, lấy/xem số, thử lại, hủy và mất mạng; kiểm tra màn hình nhỏ. Test thành phần đặt cạnh feature, test toàn luồng đặt tests/e2e. Phân biệt ca tự động và thử tay.
- Kiểm tra/bàn giao: Không thao tác nhầm hồ sơ/phiếu; nút và thông báo khớp API. Lỗi cấp/quyền gửi Đức Anh/Hưng, lỗi patient UI/API hủy đưa sang 3.14.

#### 3.14 — Sửa lỗi và hướng dẫn người dùng
- Giờ: 6. Phụ thuộc: 3.13 FS.
- AC: Luồng người bệnh hoàn chỉnh, có bằng chứng E2E và hướng dẫn ngắn.
- Đầu ra: Giao diện/API hủy đã sửa lỗi; hướng dẫn người dùng; bằng chứng.
- Vị trí: `client/src/features/patient/`, `server/src/modules/tickets/ticket-cancel.service.js`, `docs/demo/patient-guide.md`.
- Cách ghép: Đạt sửa UI người bệnh/API hủy trong tệp cũ; không sửa cấp số thay Đức Anh. Chạy lại E2E và viết hướng dẫn bằng màn hình thật. Nếu cần đổi requestId hoặc quyền, phối hợp chủ mô đun trước PR.
- Kiểm tra/bàn giao: Luồng người bệnh đạt AC trên main, hướng dẫn khớp sản phẩm. Bàn giao trước hết thứ tư tuần 15; Trực nhận E2E và tài liệu cho 3.20.

#### 3.15 — Tài liệu, review chéo và sự kiện sprint
- Giờ: 8. Phụ thuộc: 3.13 FF; 3.14 FF; 3.16 FF; 3.17 FF.
- AC: Tài liệu 2 giờ; phối hợp/review 4 giờ; sự kiện 2 giờ. Có bằng chứng.
- Đầu ra: Tài liệu cập nhật; review; kiểm tra tích hợp; demo/retro
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV5 — Trần Quang Trung
Reviewer: Đặng Thành Đạt.

#### 3.16 — Kiểm thử toàn luồng nhân viên
- Giờ: 6. Phụ thuộc: 2.17 FS.
- AC: Luồng trên giao diện khớp API; lỗi có thông báo rõ và có thể tiếp tục thao tác.
- Đầu ra: Kết quả E2E nhân viên trên hai trình duyệt.
- Vị trí: `tests/e2e/staff-flow.spec.js`, `tests/e2e/staff-conflict.spec.js`, `docs/testing/cases/3-16.md`.
- Cách ghép: Trung kiểm tra toàn luồng nhân viên trên bản tích hợp: phiên, gọi/gọi lại, bắt đầu, hoàn tất, ghi vắng, xung đột và mất mạng. Kiểm tra API/DB với An và Hoàng Anh; không đổi quy tắc server để làm UI test pass.
- Kiểm tra/bàn giao: UI khớp trạng thái thật, báo lỗi rõ và tiếp tục được sau tải lại. Ghi lỗi UI cho 3.17; lỗi phiên/queue gửi đúng chủ API.

#### 3.17 — Sửa lỗi giao diện quầy và tài liệu
- Giờ: 6. Phụ thuộc: 3.16 FS.
- AC: Nhân viên thao tác hết vòng đời từ một màn hình; bằng chứng chạy được lưu đầy đủ.
- Đầu ra: Giao diện nhân viên đã sửa lỗi; hướng dẫn thao tác và bằng chứng.
- Vị trí: `client/src/features/staff/`, `tests/e2e/staff-flow.spec.js`, `docs/demo/staff-guide.md`.
- Cách ghép: Trung sửa staff UI ở tệp cũ, giữ import SessionPanel của An. Chạy lại các ca sau khi API sửa đã merge; viết hướng dẫn vận hành từ màn hình thật, phân biệt hoàn tất đăng ký với khám xong.
- Kiểm tra/bàn giao: Một màn hình vận hành được hết vòng đời, không báo thành công giả. Bàn giao trước hết thứ tư tuần 15 để Trực kiểm thử/đóng gói.

#### 3.18 — Tài liệu, review chéo và sự kiện sprint
- Giờ: 8. Phụ thuộc: 3.16 FF; 3.17 FF; 3.19 FF; 3.20 FF.
- AC: Tài liệu 2 giờ; phối hợp/review 4 giờ; sự kiện 2 giờ. Có bằng chứng.
- Đầu ra: Tài liệu cập nhật; review; kiểm tra tích hợp; demo/retro
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.

### TV6 — Phan Trung Trực
Reviewer: Trần Quang Trung.

#### 3.19 — Thử tải và đo tốc độ cập nhật
- Giờ: 6. Phụ thuộc: 2.20 FS.
- AC: Có số đo, điều kiện thử và lỗi. Mục tiêu 95% yêu cầu trong 2 giây, cập nhật trong 5 giây.
- Đầu ra: Báo cáo thử tải 50 phiên/5 phút và tốc độ cập nhật.
- Vị trí: `tests/load/`, `docs/testing/load-report.md`, `docs/testing/evidence/3-19/`.
- Cách ghép: Trực đặt kịch bản và cấu hình đo tải trong tests/load, kết quả trong load-report.md. Thử 50 client/5 phút, đọc mỗi 3 giây; ghi máy, mạng, dữ liệu, commit, p95, lỗi và độ trễ cập nhật UI.
- Kiểm tra/bàn giao: So số thực với mục tiêu p95 API ≤2 giây và cập nhật ≤5 giây. Kết quả chưa đạt phải ghi rõ; gửi điểm nghẽn cho chủ mô đun sửa và chạy lại.

#### 3.20 — Kiểm thử tích hợp và đóng gói demo
- Giờ: 6. Phụ thuộc: 3.19 FS; 3.2 FS; 3.5 FS; 3.8 FS; 3.11 FS; 3.14 FS; 3.17 FS.
- AC: Xong sửa lỗi 6 mô đun; test hồi quy/E2E và cài sạch đạt; không còn lỗi chặn/lộ dữ liệu; đủ bằng chứng để An nghiệm thu.
- Đầu ra: Gói demo có phiên bản; mã nguồn, seed, README; báo cáo test cuối; kịch bản demo.
- Vị trí: `README.md`, `docs/testing/final-report.md`, `docs/demo/demo-script.md`, `docs/demo/release-checklist.md`.
- Cách ghép: Thứ năm và thứ sáu tuần 15, Trực lấy main sau 3.19 và sáu task sửa lỗi đã xong, clone vào thư mục mới, cài DB sạch rồi chạy hồi quy/E2E. Tổng hợp nguồn/seed/README/test/demo cùng commit. Build/gói xuất nằm bản bàn giao hoặc release, không chép vào src.
- Kiểm tra/bàn giao: Đủ kết quả để An nghiệm thu ở 3.3; Trung review. Chỉ chốt nhãn phiên bản sau An duyệt; lỗi chặn hoặc lộ dữ liệu còn mở phải được báo và xử lý.

#### 3.21 — Tài liệu, review chéo và sự kiện sprint
- Giờ: 8. Phụ thuộc: 3.19 FF; 3.20 FF; 3.1 FF; 3.2 FF.
- AC: Tài liệu 2 giờ; phối hợp/review 4 giờ; sự kiện 2 giờ. Có bằng chứng.
- Đầu ra: Tài liệu cập nhật; review; kiểm tra tích hợp; demo/retro
- Cập nhật tài liệu mô đun trong docs/requirements và docs/modules; hợp đồng/kiến trúc theo phạm vi; review theo vòng phân công và ghi bằng chứng sự kiện trên Issue. An tổng hợp docs/sprints.
