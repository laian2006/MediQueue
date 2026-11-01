# Thiết kế chung MediQueue

Tiêu chuẩn triển khai thống nhất cho nhóm 11

**Phiên bản:** 1.0, ban hành ngày 01/11/2026.

**Trạng thái:** ÁP DỤNG TRIỂN KHAI. Các thành viên thực hiện theo thiết kế, hợp đồng API và phân công trong tài liệu này.

Cả nhóm sử dụng thiết kế này làm căn cứ chung để triển khai MediQueue. Mỗi thành viên chịu trách nhiệm phần được giao và các điểm tích hợp liên quan. Khi gặp vướng mắc, báo An kèm ảnh hưởng và phương án xử lý; không tự thay đổi hợp đồng dùng chung.

### Vấn đề và sản phẩm cần làm

MediQueue mô phỏng việc lấy số và vận hành hàng chờ tại một quầy đăng ký ngoại trú. Người đại diện chọn hồ sơ được phép, lấy/xem/hủy phiếu; nhân viên gọi và tiếp nhận theo FIFO; bảng công khai chỉ hiển thị số và trạng thái.

- Một quầy, một hàng thông thường; tài khoản/hồ sơ được tạo sẵn bằng seed giả lập. Không có tự đăng ký tài khoản hoặc cấp quyền hồ sơ trên giao diện.
- Phạm vi chưa gồm cấp cứu/ưu tiên y tế, bệnh án, BHYT, thanh toán, đặt lịch khám hoặc tích hợp bệnh viện. COMPLETED chỉ là xong đăng ký ở quầy.
- Sản phẩm gồm web React, backend Express, PostgreSQL, migration/seed, tài liệu và bằng chứng kiểm thử. Các bạn tự viết phần triển khai theo WBS; tài liệu này chưa phải ứng dụng đã chạy.
### Giữ nguyên ba sprint đã lập

| Mốc | Kết quả cần đạt |
| --- | --- |
| Sprint 1 — tuần 10–11 | Đăng nhập, chọn hồ sơ, lấy/xem số, gọi cơ bản; API/thiết kế và DB tích hợp. |
| Sprint 2 — tuần 12–13 | Quyền đầy đủ, requestId, hủy, gọi lại/tiếp nhận/ghi vắng và ngừng/đóng phiên. |
| Sprint 3 — tuần 14–15 | Test/sửa/hồi quy, đo tải, cài sạch và gói demo; Trực 3.20 trước An nghiệm thu 3.3. |
| Tuần 16 | Demo và đánh giá theo lịch lớp. |



Giờ dự kiến giữ 20 giờ/người/sprint. Thiết kế chi tiết nằm trong phần phân tích/tài liệu đã được phân công; không tự cộng thêm giờ. Mốc bắt đầu tuần 10 dự kiến 02/11/2026 cần đối chiếu lịch môn.

**Cách đọc:** Trang 2–6: kiến trúc, dữ liệu, trạng thái, quyền. Trang 7–9: API. Trang 10–12: ghép màn hình, giao dịch, kiểm thử và WBS. Trang 13: quy định triển khai và quản lý thay đổi.

## Kiến trúc và trách nhiệm từng thành viên

Luồng yêu cầu đi từ React tới API; các mô đun backend cùng chạy trong một máy chủ Express. Mũi tên thể hiện hướng xử lý, không phải các dịch vụ độc lập.

| Chủ trì | Đầu ra và ranh giới |
| --- | --- |
| An | QueueSession và SessionPanel; kiến trúc/API chung; nghiệm thu. |
| Hưng — TV1 | Auth, PatientProfile/PatientAccess, LoginPage và middleware quyền. |
| Đức Anh — TV2 | Ticket, cấp/đọc phiếu, vị trí chờ và requestId; Đạt làm dịch vụ hủy trong cùng mô đun. |
| Hoàng Anh — TV3 | FIFO, gọi/gọi lại, bắt đầu/hoàn tất/ghi vắng; Trung dùng các API này. |
| Đạt — TV4 | PatientPage và API hủy WAITING; dùng auth/quyền của Hưng, phiếu của Đức Anh. |
| Trung — TV5 | StaffPage; import SessionPanel của An và gọi API Hoàng Anh. |
| Trực — TV6 | Khung/pool/transaction, helper TicketEvent, public-board và môi trường tích hợp/demo. |



## Mô hình dữ liệu và quyền đại diện

Sơ đồ các quan hệ nghiệp vụ chính. Đường nối Ticket–TicketEvent và QueueSession–Ticket đều là một–nhiều; khóa ngoại chi tiết ở trang 4.

### Định danh phải dùng nhất quán

- User là người đăng nhập. PatientProfile là hồ sơ người bệnh giả lập. PatientAccess là quyền một User đại diện một PatientProfile; mỗi cặp user_id/patient_id là duy nhất.
- Hai người đại diện có thể cùng liên kết một patient_id. Điều kiện một phiếu hoạt động phải kiểm tra theo patient_id và session_id, không theo user_id.
- Các khóa định danh là UUID, API trả dạng chuỗi. DB dùng tên cột snake_case; API dùng camelCase và chuyển đổi tại lớp truy vấn/DTO thống nhất.
### Dữ liệu khởi tạo để cả nhóm kiểm thử

Seed có hai tài khoản REPRESENTATIVE, ít nhất một STAFF; một hồ sơ chung cho hai đại diện và mỗi đại diện có một hồ sơ riêng. Dùng mã giả như P001/P002, tên giả; không nhập thông tin người thật. Mỗi DB thử cài lại bằng cùng migration/seed.

### Phiên đăng nhập khác phiên xếp hàng

Dùng phiên đăng nhập phía server, lưu bền trong PostgreSQL. Bảng kỹ thuật auth_sessions hoặc tên do thư viện cung cấp là hạ tầng xác thực, không phải QueueSession và không thay đổi sáu thực thể nghiệp vụ. Hưng/Trực lựa chọn và ghi rõ thư viện, phiên bản, migration tương ứng trong task được giao; bảo đảm đúng cơ chế đã quy định.

## Trường dữ liệu và ràng buộc bắt buộc

| Thực thể và bảng | Các trường dữ liệu | Điều kiện |
| --- | --- | --- |
| User — users | user_id, username, display_name, password_hash, role | PK user_id; username duy nhất; role REPRESENTATIVE hoặc STAFF; mật khẩu không lưu rõ. |
| PatientProfile — patient_profiles | patient_id, code, display_name | PK patient_id; code duy nhất; dữ liệu giả lập. |
| PatientAccess — patient_access | user_id, patient_id | PK ghép hai cột; FK tới users và patient_profiles; dùng cho người đại diện. |
| QueueSession — queue_sessions | session_id, status, last_issued_number, opened_by, opened_at, stopped_by, stopped_at, closed_by, closed_at, updated_at | PK; status OPEN/STOPPED/CLOSED; bộ đếm ≥0; các *_by là FK users, stopped/closed có thể null. |
| Ticket — tickets | ticket_id, session_id, patient_id, issued_by_user_id, request_id, number, status, last_called_at, created_at, updated_at | PK; FK phiên/hồ sơ/người gửi; number ≥1; status theo vòng đời; last_called_at null khi chưa gọi. |
| TicketEvent — ticket_events | event_id, ticket_id, actor_user_id, action, from_status, to_status, occurred_at | PK; FK Ticket/User; from_status null ở ISSUED; không sửa/xóa lịch sử trong luồng ứng dụng. |



### Các điều kiện DB phải bảo vệ

- Tối đa một QueueSession có status OPEN hoặc STOPPED. Tối đa một Ticket CALLED hoặc REGISTERING trong mỗi phiên.
- Duy nhất (session_id, number). Duy nhất (session_id, patient_id) cho các phiếu WAITING/CALLED/REGISTERING. Duy nhất (issued_by_user_id, request_id) trên toàn bộ lịch sử Ticket.
- Dùng unique/partial unique index kết hợp kiểm tra nghiệp vụ và giao dịch. Giữ các khóa ngoại; không dùng việc ẩn nút UI để thay cho ràng buộc dữ liệu.
### Thời gian và sự kiện

DB lưu thời gian có múi giờ; API trả UTC ISO 8601. UI đổi sang giờ hiển thị, không tự quyết định điều kiện T. action gồm ISSUED, CALLED, RECALLED, STARTED, COMPLETED, CANCELLED, NO_SHOW. Gọi lại ghi CALLED → CALLED và cập nhật last_called_at.

Đổi trạng thái phiếu phải có sự kiện cùng giao dịch. Mở/ngừng/đóng QueueSession được ghi bằng các trường người/thời điểm của phiên, không tạo TicketEvent thiếu ticket_id.

## Vòng đời phiên và phiếu

Ghi vắng và hủy là trạng thái cuối. Phiên chỉ đóng từ STOPPED khi đã xử lý hết phiếu hoạt động; không có chức năng mở lại STOPPED trong phạm vi hiện tại.

| Thao tác | Điều kiện và kết quả |
| --- | --- |
| Lấy số | Chỉ OPEN, có quyền hồ sơ, chưa có phiếu hoạt động; tạo WAITING. |
| Gọi tiếp | OPEN/STOPPED, quầy rảnh; WAITING có number nhỏ nhất thành CALLED. |
| Gọi lại | Chỉ CALLED; giữ ticketId/number, đặt lại lastCalledAt. |
| Bắt đầu / hoàn tất | CALLED → REGISTERING → COMPLETED; hoàn tất giải phóng quầy. |
| Hủy | Người đại diện có quyền; chỉ WAITING → CANCELLED. |
| Ghi vắng | STAFF chủ động thao tác; chỉ CALLED, đủ T từ lần gọi gần nhất → NO_SHOW. |
| Ngừng / đóng phiên | STOPPED không cấp mới nhưng xử lý phiếu cũ. Chỉ đóng khi không còn phiếu hoạt động. |



T = 60 giây, cấu hình NO_SHOW_TIMEOUT_SECONDS dùng chung. Đúng T được phép ghi vắng; trước T bị từ chối. Đây là tham số mô phỏng để demo, không phải quy định bệnh viện. Test dùng thời gian kiểm soát được. Phiếu cuối không được đưa lại WAITING; người quay lại lấy phiếu mới với requestId mới nếu phiên vẫn OPEN.

## Đăng nhập phân quyền và phản hồi API

### Cơ chế đăng nhập Hưng và Trực triển khai

Dùng phiên phía server và cookie mediqueue.sid: HttpOnly, SameSite=Lax; Secure khi dùng HTTPS. Thời hạn tuyệt đối 8 giờ, không tự gia hạn theo hoạt động. Đăng nhập tạo định danh mới; đăng xuất hủy phiên server và xóa cookie. Store PostgreSQL để phiên đăng nhập không phụ thuộc bộ nhớ tiến trình.

Client gửi cookie qua lớp http.js chung. Server chỉ cho origin frontend đã cấu hình; thao tác ghi dùng JSON và kiểm tra Origin phù hợp cho trình duyệt. Không lưu session secret/DB password trong client. Hưng/Trực ghi cấu hình cụ thể và cách thử vào README; các phần này chưa được cấu hình sẵn.

| Nhóm API | Chưa đăng nhập | REPRESENTATIVE | STAFF |
| --- | --- | --- | --- |
| Đăng nhập; bảng công khai | Được phép | Được phép | Được phép |
| Tài khoản hiện tại; phiên hiện tại | Không | Được | Được |
| Danh sách hồ sơ; lấy/xem/hủy phiếu riêng | Không | Theo PatientAccess | Không trong phạm vi này |
| Mở/ngừng/đóng phiên; vận hành quầy | Không | Không | Được |



### Quy ước đầu vào và đầu ra

- Tiền tố /api/v1. JSON camelCase; ID UUID dạng chuỗi; thời gian UTC ISO 8601. Các trường thời gian chưa có trả null, không trả chuỗi rỗng.
- Thành công trả {data: ...}; POST mở phiên/tạo phiếu lần đầu trả 201, đọc/cập nhật và gửi lại hợp lệ trả 200. Lỗi trả {error: {code, message, details?}}; không trả stack trace.
- 400 đầu vào sai; 401 chưa/hết đăng nhập; 403 sai vai trò hoặc ngoài quyền hồ sơ; 404 đối tượng không tồn tại; 409 xung đột nghiệp vụ; 500 lỗi hệ thống. Kiểm tra xác thực/quyền trước trả dữ liệu riêng.
- Tài khoản/hồ sơ/quyền được seed, chưa có CRUD quản trị. Staff chỉ vận hành hàng chờ; không tự có quyền làm người đại diện cho mọi hồ sơ.
Các route và schema máy đọc được nằm docs/api/openapi.yaml. Tệp này là hợp đồng triển khai chung; tiến độ và kết quả API được theo dõi bằng task, mã nguồn và kiểm thử.

## API tài khoản hồ sơ và phiên

Mọi đường dẫn bên dưới được ghép sau /api/v1. Tham số trong { } lấy từ path; ? trong tên kiểu trả về nghĩa là data có thể null. Kiểu DTO được giải thích dưới bảng.

| Phương thức và đường dẫn | Đầu vào | data trả về | Chủ trì / WBS |
| --- | --- | --- | --- |
| POST /auth/login | username, password | LoginData | Hưng; 1.4 |
| GET /auth/me | Không có body | User | Hưng; 1.4 |
| POST /auth/logout | Không có body | null | Hưng; 2.5 |
| GET /patients | Không có body | Patient[] | Hưng; 1.5 |
| GET /sessions/current | Không có body | Session? | An; 1.1 |
| POST /sessions | Không có body | Session | An; 1.1 |
| POST /sessions/{sessionId}/stop | Không có body | Session | An; 2.1 |
| POST /sessions/{sessionId}/close | Không có body | Session | An; 2.1 |



### DTO thống nhất

- User: userId, displayName, role. LoginData: user cùng expiresAt. Logout trả data=null và hủy phiên xác thực phía server.
- Patient: patientId, code, displayName. GET /patients chỉ trả hồ sơ được PatientAccess cho phép.
- Session: sessionId, status, lastIssuedNumber, openedAt, stoppedAt, closedAt. GET /sessions/current trả OPEN/STOPPED; không có trả data=null.
### Quy tắc phiên để An và các bạn cùng dùng

POST /sessions không nhận body; nhân viên tạo OPEN với lastIssuedNumber=0. Nếu còn OPEN/STOPPED trả 409 SESSION_ALREADY_ACTIVE. Các yêu cầu mở đồng thời vẫn chỉ tạo một phiên.

Stop đang STOPPED hoặc close đã CLOSED trả nguyên trạng thái hiện tại 200, không thêm thay đổi. Stop CLOSED hoặc close OPEN trả 409 INVALID_STATE. Close STOPPED còn phiếu hoạt động trả 409 ACTIVE_TICKETS_REMAIN. Không xóa lịch sử phiên cũ; phiên mới bắt đầu dãy số riêng.

## API phiếu và chống gửi trùng

| Phương thức và đường dẫn | Đầu vào | data trả về | Chủ trì / WBS |
| --- | --- | --- | --- |
| POST /tickets | patientId, sessionId, requestId | TicketView | Đức Anh; 1.8; 2.7; 2.8 |
| GET /tickets/active | Query: patientId, sessionId | TicketView? | Đức Anh; 1.8 |
| GET /tickets/{ticketId} | Không có body | TicketView | Đức Anh; 1.8 |
| POST /tickets/{ticketId}/cancel | Không có body | TicketView | Đạt; 2.13 |



### TicketView

data gồm ticket và waitingAhead. Ticket có ticketId, sessionId, patientId, number, status, lastCalledAt, createdAt, updatedAt. waitingAhead chỉ là số phiếu WAITING có number nhỏ hơn khi chính phiếu còn WAITING; trạng thái khác trả null. Không suy thành thời gian khám dự kiến.

GET /tickets/active trả TicketView của phiếu hoạt động hoặc data=null. GET /tickets/{ticketId} đọc được cả phiếu cuối nếu còn quyền hồ sơ. Nhờ đó reload trang hoặc đại diện khác có quyền vẫn tìm được phiếu của cùng patientId.

### Cấp mới và gửi lại được xử lý khác nhau

**1.** Người dùng chọn hồ sơ/phiên; client tạo requestId cho một thao tác lấy số. Nếu mất phản hồi, giữ nguyên cả ba trường patientId, sessionId, requestId để thử lại; không tự đổi sessionId khi đang thử lại.

**2.** Server xác thực người gửi và quyền với hồ sơ trước khi trả dữ liệu. Tra khóa (issued_by_user_id, request_id) trên cả lịch sử, không chỉ các phiếu đang hoạt động.

**3.** Có khóa và cùng patientId/sessionId: trả cùng ticketId với trạng thái hiện tại, kể cả đã hủy/kết thúc hoặc phiên đã đóng; không cấp số/thêm sự kiện. Khác nội dung: 409 IDEMPOTENCY_CONFLICT.

**4.** Chưa có khóa: phiên phải OPEN; không có phiếu hoạt động của patientId trong phiên. Nếu đã có: 409 ACTIVE_TICKET_EXISTS, details chứa ticketId đã tồn tại của hồ sơ được phép.

**5.** Tạo Ticket, tăng bộ đếm và TicketEvent trong một giao dịch. Khóa/ràng buộc bảo vệ cả gửi lại đồng thời. Lỗi giữa chừng không để dữ liệu dở dang.

Hai người đại diện có thể dùng hai requestId khác nhau cho cùng hồ sơ: điều kiện một phiếu hoạt động ở DB vẫn phải chặn phiếu thứ hai. Phiếu hủy không xóa và không giải phóng số cũ để cấp lại.

## API quầy và bảng công khai

| Phương thức và đường dẫn | Đầu vào | data trả về | Chủ trì / WBS |
| --- | --- | --- | --- |
| GET /queue/waiting | Query: sessionId | WaitingQueue | Hoàng Anh; 1.11 |
| GET /queue/current | Query: sessionId | CurrentQueue | Hoàng Anh; 1.11 |
| POST /queue/call-next | sessionId | Ticket | Hoàng Anh; 1.11 |
| POST /queue/tickets/{ticketId}/recall | Không có body | Ticket | Hoàng Anh; 2.10 |
| POST /queue/tickets/{ticketId}/start | Không có body | Ticket | Hoàng Anh; 2.10 |
| POST /queue/tickets/{ticketId}/complete | Không có body | Ticket | Hoàng Anh; 2.10 |
| POST /queue/tickets/{ticketId}/no-show | Không có body | Ticket | Hoàng Anh; 2.11 |
| GET /public/board | Không có body | Board | Trực; 1.20; 2.19 |



### Dữ liệu nhân viên

WaitingQueue có tickets: các Ticket WAITING theo number tăng. CurrentQueue có ticket là Ticket hoặc null, noShowTimeoutSeconds và serverTime. API chỉ cho STAFF; các thao tác tiếp nhận hoạt động trong OPEN/STOPPED, không trong CLOSED.

Gọi tiếp khi bận: 409 COUNTER_BUSY; hàng rỗng: 409 QUEUE_EMPTY. Sai trạng thái: 409 INVALID_STATE. Ghi vắng trước T: 409 NO_SHOW_TOO_EARLY, details.remainingSeconds là phần còn lại làm tròn lên; UI dùng để giải thích, máy chủ vẫn quyết định.

### Dữ liệu công khai

Board có currentTicket={number,status} hoặc null, waitingNumbers là mảng số WAITING tăng dần, updatedAt là thời điểm server tạo bản chụp. Khi không có phiên chưa đóng, trả currentTicket=null và waitingNumbers=[]. Không trả bất kỳ ID nội bộ, tên, tài khoản hoặc thông tin sức khỏe nào.

Client đọc mỗi 3 giây ở các màn hình cần cập nhật; lượt gọi lại giữ số nên bảng vẫn cập nhật trạng thái hiện tại. Client tự lưu thời điểm lần nhận thành công để báo dữ liệu cũ khi mất mạng, không dùng dữ liệu cũ như vừa đồng bộ.

## Ghép màn hình thành một luồng sử dụng

| Màn hình | Chủ trì | Nguồn và cách ghép |
| --- | --- | --- |
| /login | Hưng | Auth API; đăng nhập xong chuyển /patient hoặc /staff theo role. |
| /patient | Đạt | Patients + current session + Ticket API; chọn rõ hồ sơ, lấy/xem/hủy, polling. |
| /staff | Trung | Queue API; import SessionPanel của An cho phần mở/ngừng/đóng. |
| /board | Trực | Chỉ public/board; không cần đăng nhập, không tái dùng phản hồi riêng của Ticket. |



### Luồng demo để kiểm tra cả nhóm cùng hiểu

**1.** Nhân viên đăng nhập, mở một phiên OPEN. An làm API/SessionPanel, Hưng làm quyền, Trung ghép khu vực phiên vào StaffPage.

**2.** Người đại diện đăng nhập và chọn hồ sơ từ GET /patients. Đạt gọi phiên hiện tại, tạo requestId, gửi lấy số; Đức Anh kiểm tra phiên/quyền và lưu Ticket/sự kiện.

**3.** Đạt đọc TicketView để hiển thị số và waitingAhead. Trực đọc API công khai riêng; hai màn hình phản ánh cùng dữ liệu DB, không tự tạo số trong UI.

**4.** Trung gọi next qua API Hoàng Anh; một phiếu thành CALLED. Người bệnh và bảng công khai thấy cập nhật ở lần đọc kế tiếp.

**5.** Sprint 2 thêm gọi lại/bắt đầu/hoàn tất/ghi vắng và hủy WAITING. Nhân viên ngừng cấp, xử lý hết phiếu, đóng phiên; phiên sau dùng dãy số mới.

### Trạng thái UI bắt buộc

- Đang tải, trống, đang gửi, thành công hoặc lỗi đều có thông báo rõ. Chỉ báo thành công sau phản hồi API; thao tác đang gửi khóa nút để giảm bấm lặp.
- Đổi hồ sơ hoặc tài khoản thì xóa dữ liệu phiếu cũ khỏi màn hình. Nếu phản hồi từ hồ sơ trước về trễ, không ghi đè trạng thái hồ sơ đang chọn.
- Mất mạng: giữ thông tin cũ cùng cảnh báo/thời điểm cập nhật. Khi kết nối lại, tải trạng thái server; hủy/gọi xung đột phải tải lại, không tự sửa trạng thái để che lỗi.
Các màn hình đặt đúng feature trong cấu trúc đã chốt. Không cần cài thêm framework hoặc tạo app riêng cho từng người; Trực khóa công cụ/phiên bản và cách chạy ở 1.19.

## Giao dịch ràng buộc và thay đổi dùng chung

### Một quy trình khóa cho mọi thao tác cạnh tranh

**1.** Xác thực và kiểm tra quyền cần thiết. Xác định session_id của thao tác; với ticketId có thể đọc định danh phiên trước, nhưng phải kiểm tra lại phiếu sau khi khóa.

**2.** Bắt đầu giao dịch trên cùng kết nối. Khóa QueueSession trước, rồi Ticket cần thay đổi theo thứ tự thống nhất. Kiểm tra lại trạng thái/quầy và thời gian sau khi chờ khóa.

**3.** Cấp/gọi/hủy/tiếp nhận thay đổi dữ liệu và gọi append-ticket-event với chính đối tượng giao dịch đó. Helper không tự mở kết nối/commit khác.

**4.** Commit toàn bộ hoặc rollback toàn bộ. Nếu tranh chấp khóa requestId, xử lý vi phạm unique sau rollback bằng đọc lại yêu cầu cũ và so nội dung; không trả 500 cho gửi lại hợp lệ.

Thứ tự khóa giúp các luồng dùng một quy ước; ràng buộc unique/partial unique là lớp bảo vệ bổ sung. Riêng mở phiên khi chưa có dòng để khóa phải dựa vào ràng buộc chỉ một phiên chưa đóng hoặc cơ chế tương đương được nhóm thống nhất. Test đồng thời phải kiểm tra dữ liệu cuối, không chỉ HTTP thành công.

### Migration và seed theo kế hoạch

| Thứ tự | Người / WBS | Nội dung |
| --- | --- | --- |
| 001_identity.sql | Hưng / 1.4 | User, PatientProfile, PatientAccess; phần store đăng nhập sau khi chốt công cụ. |
| 002_sessions.sql | An / 1.1 | QueueSession và điều kiện một phiên chưa đóng. |
| 003_tickets.sql | Đức Anh / 1.7 | Ticket, số duy nhất, phiếu hoạt động và khóa requestId. |
| 004_ticket_events.sql | Trực thiết kế / 1.19; Đức Anh ghép / 1.7 | TicketEvent sau Ticket; test cùng giao dịch với helper. |



Trực kiểm tra helper bằng test double khi Ticket chưa có, bàn giao hợp đồng sớm; Đức Anh ghép migration 003/004 với DB thật ở 1.7 để tránh vòng chờ. Store đăng nhập có DDL riêng do công cụ yêu cầu thì Hưng/Trực đăng ký tên/thứ tự với An; không chiếm số đã giao hoặc tự sửa migration đã áp dụng.

### Quy định đổi hợp đồng

Yêu cầu thay đổi phải ghi trên Issue đúng WBS, nêu API/schema/UI bị ảnh hưởng và bên nhận. An quyết định sau khi xem xét với các chủ phần; cập nhật OpenAPI/ERD, triển khai và test cùng đợt. Chỉ một bản nguồn chính; không tạo nhiều schema/API contract theo từng thành viên.

## Kiểm thử và mốc nghiệm thu chung

| Nhóm ca | Kết quả cần chứng minh | Chủ trì / WBS |
| --- | --- | --- |
| Mở phiên đồng thời | Chỉ một OPEN/STOPPED; yêu cầu còn lại bị từ chối. | An 1.1; 3.1 |
| Quyền hồ sơ | Đại diện chỉ đọc/lấy/hủy hồ sơ được phép; trái quyền không đổi dữ liệu. | Hưng 1.5; 2.4–2.5; 3.4 |
| Cấp số và hai đại diện | Số duy nhất; tối đa một phiếu hoạt động cùng patientId/phiên. | Đức Anh 1.7; 2.8; 3.7 |
| Gửi lại | Cùng khóa/nội dung trả cùng Ticket kể cả cuối; khác nội dung báo 409. | Đức Anh 2.7; 3.7 |
| Gọi FIFO / hai nhân viên | Gọi đúng WAITING nhỏ nhất, chỉ một lượt chiếm quầy. | Hoàng Anh 1.11; 3.10 |
| Hủy và gọi cạnh tranh | Một chuyển trạng thái hợp lệ, lịch sử không mâu thuẫn. | Đạt 2.13; Hoàng Anh 2.11 |
| Gọi lại và T | Giữ số; trước T từ chối, đúng/sau T cho ghi vắng nếu còn CALLED. | Hoàng Anh 2.10–2.11 |
| Ngừng và đóng phiên | Không cấp mới trong STOPPED; còn phiếu không đóng; xử lý hết thì đóng. | An 2.1–2.2; 3.1 |
| Rollback và restart API | Không có dữ liệu dở dang; phiếu/lịch sử còn sau API restart. | Đức Anh 3.8; Trực phối hợp |
| UI và mất mạng | Không nhầm hồ sơ, không báo thành công giả, báo dữ liệu cũ và phục hồi. | Đạt 3.13; Trung 3.16 |
| Dữ liệu công khai | Kiểm tra JSON không có danh tính/ID nội bộ, không chỉ xem UI. | Trực 1.20; 2.19 |
| Tải và cập nhật | 50 client/5 phút, đọc 3 giây; đo p95 API và độ trễ UI, ghi điều kiện. | Trực 3.19 |
| Cài sạch và gói cuối | Clone mới cài/chạy theo README; mọi tài liệu/test cùng commit. | Trực 3.20 → An 3.3 |



Mục tiêu đo: p95 API ≤2 giây; UI cập nhật ≤5 giây trong điều kiện thử bình thường. Đây là mục tiêu cần kiểm chứng, không phải kết quả hiện có. Ghi số mẫu, lỗi, cấu hình máy/mạng/dữ liệu và commit; không thay mục tiêu vào cột kết quả.

Các phần sửa chức năng hoàn tất trước hết thứ tư tuần 15. Thứ năm–sáu: Trực 3.20 chạy hồi quy/E2E/cài sạch và đóng gói; An chỉ duyệt 3.3 sau kết quả đó. Done yêu cầu đạt AC, có test, review, tích hợp và tài liệu khớp; không còn lỗi chặn/lộ dữ liệu.

## Quy định triển khai và quản lý thay đổi

Các quy định dưới đây có hiệu lực từ đầu tuần 10 và được áp dụng cho toàn bộ dự án. Thành viên đọc phần phụ trách trước khi làm task, phối hợp đúng đầu mối và không tự thay đổi API, schema hoặc quy tắc nghiệp vụ dùng chung.

| Quy định | Yêu cầu áp dụng | Phụ trách |
| --- | --- | --- |
| Kiến trúc và ranh giới | Một React, một Express, PostgreSQL; các chủ mô đun theo trang 2. | Cả nhóm; An điều phối |
| Đăng nhập | Server session + cookie HttpOnly; store PostgreSQL; 8 giờ tuyệt đối, logout hủy server. | Hưng, Trực; An |
| Định danh và dữ liệu | UUID chuỗi; DB snake_case/API camelCase; sáu thực thể và ràng buộc trang 4. | Hưng, An, Đức Anh, Trực |
| Đóng phiên | Chỉ STOPPED hết phiếu mới CLOSED; không mở lại STOPPED; stop/close lặp hợp lệ trả 200. | An, Đức Anh, Hoàng Anh, Trung |
| Thời gian ghi vắng | T=60 giây từ lần gọi gần nhất; máy chủ quyết định, nhân viên chủ động ghi vắng. | Hoàng Anh, Trung; An |
| Hợp đồng API | 20 thao tác trang 7–9 và openapi.yaml; envelope/data/null/lỗi theo trang 6. | Chủ API và bên UI nhận |
| Gửi lại và phiếu hiện có | Khóa người gửi/requestId; giữ body khi retry; phiếu hoạt động khác khóa báo 409. | Đức Anh, Hưng, Đạt |
| Công cụ và migration | Trực/Hưng ghi rõ thư viện, phiên bản, store auth và lệnh chạy/test trong task được giao; migration đúng thứ tự. | Trực, Hưng; An |
| Khả năng hoàn thành | Báo sớm task bị chặn, thiếu phụ thuộc hoặc vượt giờ dự kiến để An xử lý và điều chỉnh kế hoạch. | Cả bảy thành viên |



### Báo vướng mắc và kiểm soát thay đổi

Báo vướng mắc theo mẫu: Tên — WBS — vấn đề — ảnh hưởng — phương án xử lý. An quyết định hướng xử lý và ghi lại trên Issue hoặc PR liên quan. Mọi thay đổi thiết kế dùng chung phải được An duyệt trước khi triển khai và cập nhật tài liệu tương ứng.

Phiên bản 1.0 là căn cứ triển khai hiện hành. Việc ban hành tài liệu không đồng nghĩa task 1.3 đã hoàn thành: review, phối hợp, cập nhật tài liệu và các sự kiện trong sprint vẫn phải được thực hiện, có bằng chứng.

### Tài liệu kỹ thuật đối chiếu

[Express session — cơ chế session phía server và tùy chọn cookie](https://expressjs.com/en/resources/middleware/session/)
[PostgreSQL — partial indexes và bảo vệ tập dòng bằng index](https://www.postgresql.org/docs/current/indexes-partial.html)
[PostgreSQL — row locking và giao dịch cạnh tranh](https://www.postgresql.org/docs/current/explicit-locking.html)
[OpenAPI 3.0.3 — định dạng hợp đồng API](https://spec.openapis.org/oas/v3.0.3.html)