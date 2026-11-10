# MediQueue

**Outpatient Registration Queue Management System — Nhóm 11, Intro to Software Engineering.**

Mô phỏng một quầy đăng ký ngoại trú và một hàng chờ thông thường, sử dụng dữ liệu giả lập. Kiến trúc đã chọn: React → Express → PostgreSQL.

## Cài và chạy — task 1.19

Khung chung đã ghép React → Express → PostgreSQL, xác thực thật của Hưng (1.4) và phiên của An (1.1). Trang chủ kiểm tra kết nối DB thật; `/patient-demo` dùng UI mock của Đạt (1.13), không cấp phiếu thật. Các màn hình/API chưa được chủ mô đun triển khai không được giả lập thành API thật. Chờ review và kiểm tra trên main trước khi đánh dấu Done.

Yêu cầu: **Node.js 22.12+ (khuyến nghị 24 LTS), npm 10+, PostgreSQL 18**. Dùng npm, giữ một `package-lock.json` trong mỗi package. Các phiên bản thư viện được khóa chính xác; máy mới dùng `npm ci`, không tạo lockfile của yarn/pnpm.

1. Clone repo, chuyển vào thư mục repo. Tạo **DB phát triển riêng** và tài khoản có quyền tạo bảng/schema trong DB đó bằng pgAdmin hoặc `createdb`. Không dùng DB tích hợp/dữ liệu người khác. PostgreSQL cần chạy trước các bước dưới.
2. Sao chép `server/.env.example` thành `server/.env`, điền `DATABASE_URL` của DB riêng. Tạo khóa bằng lệnh sau rồi đặt kết quả vào `SESSION_SECRET` (không commit):

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Giữ `PORT=3000`, `CLIENT_ORIGIN=http://localhost:5173`, `COOKIE_SECURE=false` trên máy HTTP; T ghi vắng = 60 giây theo thiết kế. `.env.example` không chứa khóa thật. URL DB có ký tự đặc biệt trong mật khẩu phải URL-encode.
3. Cài server, áp dụng migration theo thứ tự và seed dữ liệu giả lập:

   ```bash
   cd server
   npm ci
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

   API ở `http://localhost:3000/api/v1`. `npm start` chạy không theo dõi thay đổi tệp. Migration có lịch sử/checksum và transaction; chạy lại không tạo bảng trùng. Không có lệnh reset. Nếu DB cũ đã chạy SQL thủ công mà chưa có lịch sử, dùng DB phát triển mới hoặc thống nhất cách chuyển đổi; không xóa DB để xử lý tự động.
4. Mở terminal thứ hai từ gốc repo:

   ```bash
   cd client
   npm ci
   npm run dev
   ```

   Mở **http://localhost:5173**. Trang chủ phải báo cơ sở dữ liệu đã kết nối. Client không cần `.env` với cấu hình mặc định; nếu đổi cổng API, sao chép `client/.env.example` thành `.env` rồi đổi `API_PROXY_TARGET` và các cổng/origin tương ứng. Vite chuyển `/api` đến Express và giữ Origin của trình duyệt. `localhost` và `127.0.0.1` là hai origin khác nhau, dùng nhất quán `localhost` khi mở UI.

Tài khoản seed: `staff_01`, `rep_a`, `rep_b`, mật khẩu thử `Demo@12345`; xem [hợp đồng xác thực](docs/modules/auth.md). Chưa có LoginPage ở task này; API đăng nhập có thể thử bằng công cụ gọi API. Cookie HttpOnly và store `auth_sessions` PostgreSQL được tạo bởi thư viện khi dùng phiên lần đầu; đăng nhập vẫn còn sau restart API. Origin khác cấu hình bị từ chối, lớp `http.js` gửi cookie và JSON. Khung này dành cho phát triển/demo; triển khai sau reverse proxy HTTPS cần chốt cấu hình proxy tin cậy trước khi bật cookie Secure, không tự tin cậy mọi proxy.

### Kiểm tra

```bash
cd server
npm test
cd ../client
npm test
npm run build
npm run preview
```

`npm run preview` dùng cổng 5173; dừng Vite dev trước khi chạy preview và giữ API đang chạy. Express không phục vụ thư mục build. Kiểm tra tích hợp cần **DB test riêng**, tài khoản có quyền tạo schema, đặt `TEST_DATABASE_URL` trước `npm test`:

```powershell
# PowerShell, từ server; thay URL mẫu bằng DB test riêng của bạn
$env:TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@localhost:5432/mediqueue_test'
npm test
```

```bash
# Git Bash, từ server
TEST_DATABASE_URL='postgresql://USER:PASSWORD@localhost:5432/mediqueue_test' npm test
```

Không có `TEST_DATABASE_URL` thì test tích hợp ghi SKIP. Các test tạo/xóa schema tạm riêng, không reset schema public. Kết quả khung: [ca 1.19](docs/testing/cases/1-19.md). Helper và DDL bàn giao ở [thiết kế TicketEvent](docs/architecture/ticket-event.md); 004 chỉ được ghép sau Ticket 003 trong task 1.7.

## Đọc trước khi làm

1. Đọc [CONTRIBUTING.md](CONTRIBUTING.md) để thống nhất workflow và quyền sửa tệp.
2. Tra task, giờ, phụ thuộc và vị trí làm tại [bảng WBS](docs/planning/task-map.md). Dùng WBS làm mã task; không thêm Work ID riêng.
3. Đọc [hướng dẫn tổ chức thư mục và tích hợp](docs/team-guides/MediQueue_Quy_chuan_thu_muc_va_tich_hop_theo_tung_task.docx), nhất là trang 2–6.
4. Đọc file hướng dẫn cá nhân và GitHub tại [docs/team-guides](docs/team-guides/).
5. Dùng đúng tên nhánh tại [danh sách nhánh theo 63 task](docs/planning/branch-names.md); quy định này thay các ví dụ tên nhánh trong tài liệu cũ.

Đường dẫn trong hướng dẫn tổ chức thư mục là quy ước chính về nơi đặt tệp; các hướng dẫn cá nhân bổ sung cách thực hiện. Chỉ tạo tệp JS/JSX/SQL khi có nội dung thật, không tạo chức năng giả chỉ để đủ tên.

## Cấu trúc

```text
client/                  Giao diện React, feature và gọi API
server/                  API Express, nghiệp vụ và truy vấn DB
database/migrations/     Thay đổi schema theo thứ tự
database/seeds/          Dữ liệu giả lập dùng chung
tests/e2e/               Kiểm thử toàn luồng
tests/load/              Kịch bản thử tải
docs/                    Yêu cầu, thiết kế, API, test và demo
.github/                 Mẫu Issue và Pull Request
```

## Phân công

- **An:** mô đun phiên và kiến trúc/điều phối/nghiệm thu.
- **Hưng, TV1:** đăng nhập và quyền đại diện.
- **Đức Anh, TV2:** cấp số, phiếu, requestId và đồng thời.
- **Hoàng Anh, TV3:** FIFO và API tiếp nhận.
- **Đạt, TV4:** giao diện người bệnh và API hủy phiếu WAITING.
- **Trung, TV5:** giao diện vận hành quầy.
- **Trực, TV6:** khung dùng chung, nhật ký, bảng công khai và tích hợp/demo.

Đạt cùng làm trong mô đun tickets nhưng chỉ chủ trì nghiệp vụ hủy; Đức Anh chủ trì cấp/đọc phiếu. Trung import SessionPanel của An, không viết lại phần phiên.

## Lịch và giờ công

- Sprint 1: tuần 10–11, luồng đăng nhập/chọn hồ sơ/lấy và xem số/gọi cơ bản.
- Sprint 2: tuần 12–13, tiếp nhận đầy đủ, ngoại lệ và quyền.
- Sprint 3: tuần 14–15, kiểm thử/sửa lỗi/hồi quy/cài sạch/đóng gói.
- Tuần 16: demo và đánh giá.

Mỗi người 20 giờ/sprint; tuần 9 chuẩn bị 2 giờ và tuần 16 demo 2 giờ tính riêng. Ngày bắt đầu tuần 10 trong Excel đang dự kiến 02/11/2026, An xác nhận theo lịch lớp.

Kế hoạch hiện hành: [Sprint Plan EN](docs/planning/MediQueue_Group11_Sprint_Plan.xlsx). Cả nhóm sử dụng bản Excel trong repo để tra cứu phân công, lịch và tiến độ. Mọi thay đổi phạm vi, lịch hoặc phân công cần thống nhất với An; khi cập nhật kế hoạch, thay tệp Excel này và commit cùng các thay đổi liên quan.

## Phạm vi

Một hàng thông thường, tài khoản và hồ sơ giả lập. Không triển khai phân loại cấp cứu, bệnh án, BHYT, thanh toán hoặc tích hợp hệ thống bệnh viện. Mỗi máy dùng DB thử riêng với cùng migration/seed; DB tích hợp tách riêng và không reset khi chưa thống nhất.

## Điều kiện hoàn thành

Đạt AC, có kết quả test, được review, ghép vào main và chạy với mô đun liên quan, tài liệu đúng phiên bản, không còn lỗi chặn/lộ dữ liệu. Mục tiêu thử tải 50 client/5 phút, đọc mỗi 3 giây, p95 API ≤2 giây và cập nhật ≤5 giây là mục tiêu cần đo, chưa phải kết quả đã đạt.
