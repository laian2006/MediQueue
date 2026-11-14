# Mô đun phiên — task 1.1 và 1.2 của An

## Phạm vi đã triển khai

- Migration `database/migrations/002_sessions.sql` tạo QueueSession đúng thiết kế v1.0.
- `GET /api/v1/sessions/current`: tài khoản đã xác thực đọc phiên OPEN/STOPPED, không có trả `200 {"data":null}`.
- `POST /api/v1/sessions`: chỉ STAFF mở một phiên OPEN, bộ đếm 0; trả 201. Còn OPEN hoặc STOPPED trả `409 SESSION_ALREADY_ACTIVE`.
- Hai API dùng DTO sáu trường: sessionId, status, lastIssuedNumber, openedAt, stoppedAt, closedAt. Thời gian UTC ISO 8601; thời gian chưa có là null.
- Task 1.2 ghép `SessionPanel` vào `/staff` qua prop `sessionPanel` của `StaffPage`. Thao tác ngừng và đóng phiên thuộc task 2.1/2.2.

## Giao diện quản lý phiên (1.2)

- `client/src/features/sessions/session.api.js` xác minh vai trò bằng `/auth/me` và dùng `http.js` để đọc `/sessions/current` hoặc mở bằng `POST /sessions`. PostgreSQL và middleware phía server quyết định kết quả.
- Nhân viên mở được phiên khi máy chủ trả `data: null`. Panel đọc lại phiên khi bấm **Tải lại phiên** hoặc quay lại cửa sổ. Khi bị 409 hoặc mất phản hồi mở phiên, panel đọc lại trạng thái và chỉ báo mở thành công sau khi nhận phản hồi POST thành công.
- Khi ghép 1.17, đặt `<SessionPanel onSessionChange={refresh} />` trong `StaffPage` và bỏ panel tĩnh khỏi route `/staff`. `refresh` là hàm đọc lại phiên và hàng đợi của quầy. Panel gọi callback sau khi máy chủ xác nhận mở phiên. Giao diện hàng đợi tại thời điểm bàn giao 1.2 vẫn là mock 1.16.
- Xem [ca thử 1.2](../testing/cases/1-2.md) để chạy lại bằng tài khoản giả lập và PostgreSQL riêng.

## Vì sao không thể mở trùng

Migration dùng unique index `uq_queue_sessions_single_active` trên hằng số 1, chỉ áp dụng cho OPEN/STOPPED. Cả hai trạng thái cùng chia sẻ một khóa; không dùng UNIQUE(status), vì cách đó vẫn cho phép một OPEN và một STOPPED.

Mở phiên là một INSERT nguyên tử qua pool chung. Không dùng chuỗi “SELECT thấy trống rồi INSERT” để quyết định độc quyền, vì hai yêu cầu có thể cùng thấy trống. PostgreSQL cho một INSERT thành công và chặn các yêu cầu còn lại. Service chỉ chuyển lỗi 23505 của đúng index trên thành 409; các lỗi DB khác chuyển đến middleware lỗi chung.

Không xóa phiên cũ khi mở mới, không lưu phiên trong biến toàn cục. Mỗi phiên mới có UUID và bộ đếm mặc định 0. Không cần TicketEvent cho mở phiên; người và thời điểm mở nằm trên QueueSession.

## Phân lớp và vị trí tệp

- `session.routes.js`: Router Express, quyền truy cập, kiểm tra body, mã HTTP và JSON. Phản hồi không lưu cache.
- `session.service.js`: quyền ở mức nghiệp vụ, mở/đọc phiên và ánh xạ xung đột một phiên chưa đóng.
- `session.repository.js`: SQL tham số hóa qua `db.query`; không tự tạo pool hoặc kết nối mới.
- `session.dto.js`: chuyển snake_case sang đúng sáu trường camelCase, không trả người mở hay cột nội bộ.
- `session.errors.js`: lỗi nghiệp vụ của mô đun; lỗi không biết chuyển cho error handler chung.

## Ghép với Hưng và Trực

Hưng bàn giao `authenticate` và `requireStaff`. Sau xác thực, `req.user` phải có `{userId, role}` lấy từ server session, không lấy từ body, query hoặc header do người dùng tự khai. GET cho cả STAFF và REPRESENTATIVE; POST chỉ STAFF. Service kiểm tra lại người thao tác để tránh bỏ qua quyền khi gọi trực tiếp. Cookie, thời hạn 8 giờ, PostgreSQL auth store và Origin do phần xác thực/khung chung đảm nhiệm.

Trực cung cấp pool PostgreSQL chung, parser JSON, error handler và đăng ký router tại `/api/v1/sessions`. Ví dụ ghép trong app/routes của Trực; các biến db/authenticate/requireStaff là đầu ra thật của khung và auth:

```js
import { createSessionRepository } from '../modules/sessions/session.repository.js';
import { createSessionService } from '../modules/sessions/session.service.js';
import { createSessionRouter } from '../modules/sessions/session.routes.js';

const repository = createSessionRepository(db);
const sessionService = createSessionService({ repository });
app.use('/api/v1/sessions', createSessionRouter({
  sessionService,
  authenticate,
  requireStaff,
}));
```

Đăng ký `express.json()` trước router và middleware lỗi sau router. Thiếu middleware xác thực/quyền làm router báo lỗi khởi tạo; không có chế độ bỏ qua auth. Lỗi hệ thống phải trả 500 với thông báo chung, không trả SQL, mật khẩu hoặc stack trace. Mã lỗi xác thực dùng UNAUTHENTICATED/FORBIDDEN; đầu vào sai dùng VALIDATION_ERROR.

POST không có trường đầu vào. Chấp nhận không body hoặc JSON `{}` để tương thích lớp HTTP chung; từ chối trường khác, mảng, null, JSON hỏng và text. Người mở luôn lấy từ `req.user.userId`. Có body thì gửi Content-Type application/json; client trình duyệt vẫn tuân theo kiểm tra Origin của khung chung.

### Migration

Chạy qua quy trình migration do Trực chốt: 001_identity của Hưng trước 002_sessions. Bảng `users.user_id` phải là UUID; mở/ngừng/đóng có FK tới users. Runner quản lý transaction và lịch sử áp dụng; không chạy lặp tệp 002 hoặc tự sửa tệp đã áp dụng lên DB dùng chung.

Migration đã có cột phục vụ sprint 2. Khi ngừng/đóng phải cập nhật đồng thời status, người, thời điểm và updated_at. CLOSED phải có thông tin đã ngừng và đã đóng; ngừng/đóng không sớm hơn các mốc trước đó. Điều kiện hết phiếu và khóa QueueSession khi cập nhật thuộc task 2.1.

Đức Anh dùng `queue_sessions.session_id` cho Ticket ở migration 003; khóa dòng QueueSession trước khi cấp số. Không đổi tên cột hoặc tự mở phiên từ mô đun Ticket. Trung dùng GET hiện tại và panel của An ở 1.2; không tạo API phiên khác.

## Kiểm thử và chạy lại

Từ thư mục `server`, unit test dùng Node, không cần DB hay Express:

```bash
node --test src/modules/sessions/__tests__/session.service.test.js
```

Để chạy API/DB test, cần Express và pg trong dependency của server, một PostgreSQL test riêng và URL do bạn cấu hình. Trực quản lý package.json/lockfile; task 1.1 không tự thay bộ công cụ của nhóm. Sau khi khung đó có đủ dependency:

```bash
TEST_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/mediqueue_test' \
node --test src/modules/sessions/__tests__/session.service.test.js tests/integration/sessions.test.js
```

Thay URL mẫu bằng DB test của máy. Tài khoản test cần quyền tạo schema. Test tạo schema `mq_sessions_test_<UUID>` riêng, chạy fixture và migration 002 trong schema đó, rồi xóa đúng schema đó. Không chạy trên DB bệnh viện hoặc dữ liệu thật. Nếu thiếu TEST_DATABASE_URL, test tích hợp ghi SKIP; không được ghi là đã pass.

`server/tests/fixtures/sessions.identity.sql` chỉ tạo users tối thiểu trong schema test vì 001 chưa có. Header x-test-actor chỉ tồn tại trong test harness để giả lập middleware; không phải cơ chế đăng nhập hoặc ví dụ dùng cho ứng dụng thật. Không sao chép fixture/auth double này vào app, migration 001 hoặc seed chính thức.

Kết quả kiểm thử lần này nằm tại `docs/testing/cases/1-1.md`.

## Điều kiện bàn giao và nghiệm thu

Phần mã đã có và đã kiểm thử trong môi trường độc lập. Trước khi đánh dấu Done, cần:

- Hưng ghép middleware thật và migration 001; kiểm tra với cookie đăng nhập, tài khoản STAFF/REPRESENTATIVE và trường hợp hết phiên đăng nhập.
- Trực ghép router, pool, JSON parser, xử lý lỗi và Origin vào app chung; chạy lại test bằng dependency/lockfile đã chốt.
- Chạy migration 001 → 002 trên DB test sạch; kiểm tra lại mở đồng thời trên app chung.
- An/Trực kiểm tra các ca bắt buộc và phiên bản trên main; bàn giao sessionId/DTO cho Đức Anh, API cho Trung. Ghi link commit và kết quả thật trên Issue 1.1.

Không đóng task chỉ vì tài liệu hoặc test với auth double đã đạt. Giữ giờ thực tế do An tự ghi; không mặc định đã làm đủ 6 giờ dự kiến.

## Tài liệu kỹ thuật tham khảo

- [PostgreSQL: partial unique indexes](https://www.postgresql.org/docs/18/indexes-partial.html).
- [node-postgres: parameterized queries](https://node-postgres.com/features/queries).
- [Express: routing and Router](https://expressjs.com/en/guide/routing/).
