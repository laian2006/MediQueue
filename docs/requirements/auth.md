# Yêu cầu mô đun xác thực và quyền hồ sơ (auth)

WBS: 1.6. Chủ trì: Lê Gia Hưng (TV1). Reviewer: Lại Quốc Bình An.

Trạng thái: bản nháp để An duyệt user stories/AC. Chưa được duyệt và chưa đủ
điều kiện đóng phần yêu cầu của task 1.6. Tài liệu được viết ngày 14/11/2026,
**sau khi** 1.4 và 1.5 đã được An review và merge vào `main`, nên các AC dưới đây
mô tả hành vi đã triển khai và đối chiếu với mã/test hiện có, không phải phân tích
viết trước khi code. Tài liệu không thay thế review chéo, kiểm tra tích hợp hoặc
sự kiện sprint của 1.6.

## Căn cứ và phạm vi

- `docs/architecture/shared-design-v1.0.md`, `docs/api/openapi.yaml`,
  `docs/architecture/erd.md`.
- [Tài liệu mô đun xác thực](../modules/auth.md), ca thử
  [1.4](../testing/cases/1-4.md) và [1.5](../testing/cases/1-5.md).
- Hưng làm đăng nhập, phiên, middleware quyền, hàm quyền hồ sơ, `GET /patients`
  và `LoginPage`. Đạt giữ màn hình chọn hồ sơ (1.14) và Trung giữ màn hình quầy (1.17);
  Trực giữ app chung, kiểm tra Origin và cấu hình phiên (1.19).
- Dữ liệu là tài khoản giả lập: `staff_01` (STAFF), `rep_a`, `rep_b`
  (REPRESENTATIVE). P001 là hồ sơ dùng chung của hai đại diện; P002 riêng của
  `rep_a`, P003 riêng của `rep_b`.
- Ngoài phạm vi Sprint 1: đăng xuất (2.5), quản lý tài khoản, cookie `Secure` qua
  HTTPS thật, tự chuyển người dùng về `/login` khi phiên hết hạn trên các màn hình
  khác (để Sprint 2, thống nhất cùng luồng đăng xuất). Trong Sprint 1, màn hình nhận
  401 báo cần đăng nhập và có đường dẫn về `/login`, như #14. Giới hạn số lần thử mật
  khẩu chưa được chốt ở task nào nên ghi là ngoài phạm vi hiện tại.

## User stories và tiêu chí chấp nhận

### AUTH-01 Đăng nhập bằng tài khoản được cấp (1.4, 1.5)

Là nhân viên hoặc người đại diện, tôi muốn đăng nhập bằng tài khoản được cấp để
hệ thống biết tôi là ai trong các thao tác tiếp theo.

- `POST /api/v1/auth/login` nhận JSON đúng hai trường `username` và `password`.
  Có trường thừa, body là mảng, text hoặc JSON hỏng trả 400 `VALIDATION_ERROR` và
  không tạo cookie. Điều kiện của từng trường:
  - `username`: thiếu, sai kiểu, rỗng sau khi trim hoặc dài hơn 100 ký tự → 400
    `VALIDATION_ERROR`. Giá trị hợp lệ được trim trước khi tra cứu.
  - `password`: thiếu, sai kiểu, rỗng hoặc dài hơn 200 ký tự → 400
    `VALIDATION_ERROR`. Giữ nguyên khoảng trắng, không trim, nên mật khẩu chỉ gồm
    khoảng trắng không bị 400 vì rỗng; nếu khác mật khẩu của tài khoản thử, API trả
    401 `INVALID_CREDENTIALS`.
- Sai tên đăng nhập và sai mật khẩu trả cùng một 401 `INVALID_CREDENTIALS` với cùng
  thông báo, để không lộ tên đăng nhập nào tồn tại. Không tạo cookie. Tên đăng nhập
  phân biệt hoa thường.
- Đăng nhập đúng trả 200 `{data: {user, expiresAt}}`. `user` chỉ có `userId`,
  `displayName`, `role`; không có `username`, hash hoặc cột DB nội bộ.
- Cookie `mediqueue.sid` là HttpOnly, SameSite=Lax, `Secure` khi chạy HTTPS.
  Phiên hết hạn tuyệt đối 8 giờ kể từ lúc đăng nhập, không gia hạn theo hoạt động.
- Mật khẩu lưu dạng băm `scrypt` có salt; không lưu mật khẩu rõ. Hash sai định dạng
  không xác minh được và không làm máy chủ ném lỗi.
- Mỗi lần đăng nhập tạo định danh phiên mới; cookie của lần đăng nhập trước mất
  hiệu lực.
- Phản hồi có `Cache-Control: no-store`.
- Thao tác ghi có `Origin` khác `CLIENT_ORIGIN` bị 403 `FORBIDDEN`. Yêu cầu từ trình
  duyệt thiếu `Origin` hợp lệ bị 403 (kiểm tra do khung chung 1.19).

### AUTH-02 Hệ thống nhận diện người gửi và vai trò (1.4)

Là mô đun khác (phiên, phiếu, hàng đợi), tôi muốn một middleware cho biết chắc
người gửi là ai và có vai trò gì để áp quyền mà không tin dữ liệu do client gửi.

- `authenticate` đặt `req.user = { userId, role, displayName }` lấy từ phiên máy chủ
  và DB, **không** từ body, query hoặc header.
- Chưa đăng nhập, cookie giả, phiên quá `expiresAt` hoặc user đã bị xóa sau khi đăng
  nhập trả 401 `UNAUTHENTICATED` ở yêu cầu kế tiếp. `userId` sai dạng cũng là 401.
- `requireStaff` đặt sau `authenticate`: STAFF đi qua; REPRESENTATIVE trả 403
  `FORBIDDEN`, kể cả khi tự thêm header hoặc body giả vai trò; thiếu `req.user` trả 401.
- `GET /api/v1/auth/me` trả 200 `{data: {userId, displayName, role}}` cho người
  đã đăng nhập, và 401 nếu chưa.
- Phiên còn hiệu lực sau khi khởi động lại API khi dùng store PostgreSQL
  (`auth_sessions`).

### AUTH-03 Người đại diện xem đúng danh sách hồ sơ được phép (1.5)

Là người đại diện đã đăng nhập, tôi muốn thấy các hồ sơ bệnh nhân mình được cấp
quyền để chọn đúng hồ sơ khi lấy số.

- `GET /api/v1/patients` chỉ dành cho REPRESENTATIVE. Chưa đăng nhập trả 401
  `UNAUTHENTICATED`; STAFF trả 403 `FORBIDDEN` và không chạm repository.
- Danh tính lấy từ phiên. Tham số `userId` trong query string bị bỏ qua.
- Mỗi phần tử chỉ có `patientId`, `code`, `displayName`, sắp theo `code`. Không
  trả trường nào khác.
- `rep_a` thấy P001 và P002; `rep_b` thấy P001 và P003. Hai đại diện cùng thấy
  P001 với cùng một `patientId`.
- Đại diện chưa được cấp hồ sơ nào nhận 200 với `data: []`, không phải lỗi.
- Phản hồi có `Cache-Control: no-store`.
- Router thiếu `authenticate` lỗi ngay khi khởi động, không âm thầm bỏ qua kiểm
  tra đăng nhập.

### AUTH-04 Hồ sơ ngoài quyền bị từ chối cho mọi mô đun (1.4, 1.5)

Là mô đun khác (phiếu, hủy phiếu, đọc phiếu), tôi muốn một hàm quyền dùng chung để
chắc chắn chỉ người được cấp quyền mới thao tác trên một hồ sơ.

- `assertCanAccessPatient(user, patientId)`: thiếu danh tính trả 401; `patientId`
  sai định dạng UUID trả 400; hồ sơ ngoài quyền, hồ sơ không tồn tại và STAFF đều trả
  403, để không lộ hồ sơ có tồn tại hay không.
- Hồ sơ riêng và hồ sơ dùng chung của đúng người đại diện được phép. `rep_a` đọc
  P003 bị 403.
- `canAccessPatient` trả true/false cho các mô đun cần kiểm tra không ném lỗi.
- Quyền gắn với `patient_id`; các mô đun dùng lại hàm này phải kiểm tra điều kiện
  "một phiếu hoạt động" theo `patient_id`, không theo `user_id`.
- Hợp đồng v1.0 chưa có API đọc một hồ sơ riêng lẻ, nên việc từ chối hồ sơ ngoài
  quyền được kiểm tra qua hàm dùng chung và qua các API dùng nó (ví dụ lấy số, 1.8).

### AUTH-05 Giao diện đăng nhập và điều hướng theo vai trò (1.5)

Là nhân viên hoặc người đại diện, tôi muốn trang đăng nhập rõ ràng để vào đúng khu
vực của mình và biết ngay khi nhập sai.

- Đăng nhập đúng vai trò REPRESENTATIVE chuyển tới `/patient`; STAFF chuyển tới
  `/staff`.
- Để trống tên đăng nhập hoặc mật khẩu: hiện nhắc nhập bằng chữ và **không** gửi yêu
  cầu. Mật khẩu không bị cắt khoảng trắng.
- Sai thông tin: hiện "Tên đăng nhập hoặc mật khẩu không đúng.", ở lại `/login`,
  ô mật khẩu được xóa. Thông báo lỗi không lộ dữ liệu của máy chủ.
- Khi đang gửi (mạng chậm): nút bị khóa và hiện "Đang đăng nhập…", bấm liên tiếp
  không gửi nhiều yêu cầu.
- Lỗi 403 (sai nguồn yêu cầu) và lỗi mạng có thông báo riêng, không hiện chung với
  sai mật khẩu.
- Hàm `isUnauthenticated(error)` chỉ coi 401 là hết phiên, để các màn hình khác dùng
  báo cần đăng nhập kèm đường dẫn về `/login` (Sprint 1). Tự chuyển trang để Sprint 2.

## Bảng tình huống lỗi

| Tình huống | Kết quả mong đợi | Kiểm tra |
| --- | --- | --- |
| Body login sai dạng, thiếu hoặc thừa trường | 400 `VALIDATION_ERROR`, không cookie | Unit + tích hợp 1.4 |
| Sai tên hoặc sai mật khẩu | 401 `INVALID_CREDENTIALS`, cùng thông báo, không cookie | Unit + tích hợp 1.4, 1.5 |
| Mật khẩu chỉ gồm khoảng trắng, khác mật khẩu tài khoản thử | 401 `INVALID_CREDENTIALS`, không cookie | Unit 1.4 |
| `username` rỗng hoặc chỉ khoảng trắng | 400 `VALIDATION_ERROR`, không cookie | Unit 1.4 |
| Không đăng nhập gọi API cần quyền | 401 `UNAUTHENTICATED` | Tích hợp 1.4, 1.5 |
| Cookie giả hoặc quá 8 giờ | 401 `UNAUTHENTICATED` | Tích hợp 1.4 |
| REPRESENTATIVE gọi API chỉ dành cho STAFF | 403 `FORBIDDEN` | Unit + tích hợp 1.4 |
| STAFF gọi `GET /patients` | 403 `FORBIDDEN` | Unit + tích hợp 1.5 |
| Hồ sơ ngoài quyền hoặc không tồn tại | 403 `FORBIDDEN` | Unit + tích hợp 1.4, 1.5 |
| `patientId` sai dạng | 400 `VALIDATION_ERROR` | Unit + tích hợp 1.4, 1.5 |
| Đại diện chưa có hồ sơ nào | 200 `data: []` | Tích hợp 1.5 |
| Nguồn yêu cầu (`Origin`) không hợp lệ | 403 `FORBIDDEN` | Khung chung 1.19 |

## Việc chưa kiểm tra hoặc để sprint sau

- Chọn hồ sơ bằng API thật trên `/patient` (1.14, Đạt) và màn hình quầy (1.17, Trung):
  trước đó chỉ dùng dữ liệu mô phỏng, không ghi là tích hợp thật.
- Tự chuyển về `/login` khi phiên hết hạn ở các màn hình khác: để Sprint 2 cùng
  luồng đăng xuất (2.5). Sprint 1 chỉ báo cần đăng nhập kèm đường dẫn về `/login`.
- Đăng xuất (2.5) và cookie `Secure` qua HTTPS thật.
- Giới hạn số lần thử mật khẩu: chưa được chốt ở task nào, ngoài phạm vi hiện tại.

## Kết quả kiểm tra tích hợp đã có

Luồng đăng nhập thật, chọn hồ sơ được phép từ `/patients`, lấy số, tải lại tìm thấy
cùng phiếu (API-15, 1.8) đã đạt ở mức API trên `main` tại `fbbcf79`; xem
[ca thử 1.6](../testing/cases/1-6.md). Những phần mô tả giao diện còn dùng dữ liệu
mô phỏng (`/patient` thuộc 1.14, `/staff` thuộc 1.17) giữ mốc `fbbcf79` và chưa tính là
tích hợp thật.
