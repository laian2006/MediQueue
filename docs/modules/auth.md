# Mô đun xác thực và quyền hồ sơ — task 1.4 và 1.5 của Hưng

## Phạm vi đã triển khai

- Migration `database/migrations/001_identity.sql`: `users`, `patient_profiles`, `patient_access` đúng ERD v1.0 (UUID, snake_case).
- Seed giả lập `database/seeds/001_identity.sql`: 1 STAFF, 2 REPRESENTATIVE, 1 hồ sơ dùng chung, mỗi đại diện thêm 1 hồ sơ riêng.
- `POST /api/v1/auth/login` và `GET /api/v1/auth/me` (server session, cookie `mediqueue.sid`).
- Middleware dùng chung `authenticate.js`, `require-staff.js` và hàm quyền `patients/patient-access.service.js`.
- Task 1.5: `GET /api/v1/patients` (`patient.routes.js`) và `LoginPage` ở `client/src/features/auth`. Điều hướng sau đăng nhập: REPRESENTATIVE → `/patient`, STAFF → `/staff`; hai màn hình này vẫn dùng mock đến khi Đạt (1.14) và Trung (1.17) nối API thật.
- Chưa làm: `POST /auth/logout` (task 2.5). Kiểm tra Origin và cấu hình app chung do Trực làm ở 1.19. Chưa đánh dấu task Done.

## Tài khoản thử (chỉ dùng cho DB thử/demo)

Mật khẩu của cả ba tài khoản: `Demo@12345`.

| username | role | hồ sơ được đại diện |
|---|---|---|
| `staff_01` | STAFF | không có |
| `rep_a` | REPRESENTATIVE | P001 (dùng chung), P002 (riêng) |
| `rep_b` | REPRESENTATIVE | P001 (dùng chung), P003 (riêng) |

ID cố định: user `00000000-0000-4000-8000-00000000000{1,2,3}` (staff, rep_a, rep_b); hồ sơ `10000000-0000-4000-8000-00000000000{1,2,3}` (P001–P003, khớp mock giao diện người bệnh). Hai đại diện chung P001 cùng trỏ về một `patient_id`.

Tạo hash mới cho mật khẩu khác (từ thư mục `server`):

```bash
node -e "import('./src/modules/auth/password.js').then(async m => console.log(await m.hashPassword('MAT_KHAU_MOI')))"
```

## API

| Phương thức | Đường dẫn | Quyền | Kết quả |
|---|---|---|---|
| POST | `/api/v1/auth/login` | công khai | 200 `{data:{user, expiresAt}}` + cookie |
| GET | `/api/v1/auth/me` | đã đăng nhập | 200 `{data:{userId, displayName, role}}` |
| GET | `/api/v1/patients` | REPRESENTATIVE | 200 `{data:[{patientId, code, displayName}]}`; chưa có hồ sơ thì `data: []` |

Đầu vào login: JSON `{username, password}`, không nhận trường khác. Lỗi: 400 `VALIDATION_ERROR` (sai dạng); 401 `INVALID_CREDENTIALS` (sai tên hoặc mật khẩu, cùng một thông báo cho cả hai trường hợp); 401 `UNAUTHENTICATED` (chưa đăng nhập, hết hạn, user không còn tồn tại). Phản hồi `Cache-Control: no-store`.

Phiên: cookie `mediqueue.sid` HttpOnly, SameSite=Lax, `Secure` khi HTTPS (`secure: true`). Hết hạn tuyệt đối 8 giờ kể từ lúc đăng nhập, không gia hạn theo hoạt động; `authenticate` kiểm tra lại `expiresAt` nên không phụ thuộc cách store gia hạn bản ghi. Mỗi lần đăng nhập tạo định danh phiên mới (`regenerate`), cookie cũ mất hiệu lực.

## Hợp đồng cho các chủ mô đun khác

Ghép trong app (Trực) — `pool` là pool PostgreSQL chung, thứ tự quan trọng:

```js
import { createSessionMiddleware } from '../shared/middleware/session.js';
import { createAuthenticate } from '../shared/middleware/authenticate.js';
import { requireStaff } from '../shared/middleware/require-staff.js';
import { createAuthRepository } from '../modules/auth/auth.repository.js';
import { createAuthService } from '../modules/auth/auth.service.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';

app.use(express.json());
app.use(createSessionMiddleware({ pool, secret: process.env.SESSION_SECRET, secure: isHttps }));
const authRepository = createAuthRepository(pool);
const authenticate = createAuthenticate({ userRepository: authRepository });
const authService = createAuthService({ repository: authRepository });
app.use('/api/v1/auth', createAuthRouter({ authService, authenticate }));
// An: createSessionRouter({ sessionService, authenticate, requireStaff })
```

- Sau `authenticate`, `req.user = { userId, role, displayName }`, lấy từ phiên server và DB, không từ body/query/header. Khớp `req.user` mà `session.routes.js` của An cần (`{userId, role}`).
- `requireStaff` đặt sau `authenticate`: STAFF qua; REPRESENTATIVE 403 `FORBIDDEN`; thiếu `req.user` 401.
- Quyền theo hồ sơ (Đức Anh, Hoàng Anh, Đạt dùng lại): `createPatientAccessService({ repository: createPatientAccessRepository(pool) })` có `assertCanAccessPatient(req.user, patientId)` (400 sai định dạng, 403 ngoài quyền hoặc là STAFF, 401 thiếu danh tính), `canAccessPatient(...)` trả true/false và `listPatients(req.user)` (DTO `patientId, code, displayName`, dùng cho task 1.5). Hồ sơ không tồn tại và hồ sơ ngoài quyền đều trả 403 để không lộ sự tồn tại. Điều kiện một phiếu hoạt động phải kiểm tra theo `patient_id`, không theo `user_id`.

## Phụ thuộc và cấu hình cần Trực chốt ở 1.19

- Dependency cho `server`: `express`, `pg`, `express-session`, `connect-pg-simple` (đã thử với express 5.3.0, express-session 1.19.0, connect-pg-simple 10.0.0). Băm mật khẩu dùng `scrypt` có sẵn trong Node, không thêm thư viện. Package/lockfile do Trực quản lý; task này không sửa `package.json`.
- Biến môi trường: `SESSION_SECRET` (≥ 32 ký tự ngẫu nhiên, không commit vào `.env.example`).
- Store phiên: `createSessionMiddleware` dùng `createTableIfMissing: true` cho bảng `auth_sessions`. Nếu nhóm muốn tạo bằng migration (số do An/Trực chốt, không dùng 001–004), DDL tương đương:

```sql
CREATE TABLE auth_sessions (
  sid varchar NOT NULL COLLATE "default",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL,
  CONSTRAINT auth_sessions_pkey PRIMARY KEY (sid)
);
CREATE INDEX idx_auth_sessions_expire ON auth_sessions (expire);
```

  Đây là bảng kỹ thuật của xác thực, không phải QueueSession.
- Kiểm tra Origin cho thao tác ghi JSON và `credentials: 'include'` ở `http.js` do Trực/Hưng ghép cùng khung.

## Chạy test

Từ thư mục `server` (unit test không cần DB hay Express):

```bash
node --test src/modules/auth/__tests__/password.test.js src/modules/auth/__tests__/auth.service.test.js \
  src/modules/patients/__tests__/patient-access.service.test.js src/shared/middleware/__tests__/authenticate.test.js
```

Test tích hợp cần `express`, `express-session`, `pg` và DB test riêng có quyền tạo schema (chạy trong schema ngẫu nhiên `mq_identity_test_<UUID>`, rồi xóa):

```bash
TEST_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/mediqueue_test' node --test tests/integration/identity.test.js
```

Thiếu `TEST_DATABASE_URL` thì test ghi SKIP, không được báo là đã pass. Kết quả lần chạy: `docs/testing/cases/1-4.md`.

## Điều kiện để Done

Chạy lại test trên PostgreSQL thật và khung chung sau khi Trực bàn giao 1.19; An review; gửi hợp đồng xác thực/quyền cho An, Đức Anh, Hoàng Anh, Đạt; kiểm tra với cookie thật qua store PostgreSQL và trình duyệt.

## Danh sách hồ sơ và đăng nhập trên giao diện — task 1.5

`GET /api/v1/patients`: `userId` lấy từ phiên server (`req.user`), không đọc từ query/body/header. Chỉ trả `patientId`, `code`, `displayName`, sắp theo `code`. Lỗi: 401 `UNAUTHENTICATED` (chưa đăng nhập hoặc hết hạn), 403 `FORBIDDEN` (STAFF không có quyền đại diện). Phản hồi `Cache-Control: no-store`. Hai đại diện chung P001 cùng thấy một `patientId`.

Hồ sơ ngoài quyền: hợp đồng v1.0 không có API đọc một hồ sơ riêng lẻ, nên việc từ chối được kiểm tra bằng hàm dùng chung `assertCanAccessPatient` (403 cho hồ sơ ngoài quyền hoặc không tồn tại, 400 cho patientId sai dạng), có test ở `tests/integration/patients.test.js`.

Giao diện (`client/src/features/auth`):

- `auth.api.js`: `authApi.login/me` và `patientsApi.list()`, đều qua `http.js` (cookie `credentials: 'include'`).
- `LoginPage.jsx`: nhãn rõ, báo lỗi bằng chữ (sai mật khẩu → "Tên đăng nhập hoặc mật khẩu không đúng."), khóa nút khi đang gửi, xóa ô mật khẩu khi lỗi.
- `auth.logic.js`: `homeFor(role)`, `validateLoginForm`, `loginErrorMessage`, `isUnauthenticated` (test bằng `node --test`).

Bàn giao cho Đạt (chọn hồ sơ trong `PatientPage`):

- Gọi `patientsApi.list()` thay cho `api.getPatients()` mock; dữ liệu nằm trong `response.data`.
- Danh sách rỗng là `200` với `[]`: giải thích rõ và không cho lấy số.
- Phản hồi 401 (hết phiên 8 giờ hoặc chưa đăng nhập): dùng `isUnauthenticated(error)` và đưa người dùng về `/login`, không hiển thị dữ liệu cũ.

Chạy test 1.5 từ thư mục `server`:

```bash
node --test src/modules/patients/__tests__/patient.routes.test.js
TEST_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/mediqueue_test' node --test tests/integration/patients.test.js
```

và từ `client`: `npm test`. Kết quả ghi ở `docs/testing/cases/1-5.md`.
