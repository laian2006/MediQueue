# Thiết kế UI vận hành quầy task 1.16

Chủ trì: Trần Quang Trung. Reviewer: Đặng Thành Đạt.

Trạng thái: bản nháp, dùng mock theo thiết kế v1.0. Chờ An xác nhận user
stories/AC ở nhánh `task/1.18`, Hoàng Anh đối chiếu quy tắc, Đạt review và
Trực bàn giao khung 1.19 để ghép vào ứng dụng. Chưa có bằng chứng tích hợp
API/PostgreSQL hoặc Done.

## Luồng và wireframe

Đăng nhập STAFF (Hưng, ngoài phạm vi 1.16) → đọc phiên hiện tại → đọc lượt hiện
tại và hàng chờ → gọi số tiếp theo khi quầy rảnh → đọc lại từ máy chủ.

- `wireframe-desktop.svg`: khu vực phiên ở trên, hai cột lượt hiện tại và hàng chờ.
- `wireframe-mobile.svg`: cùng nội dung theo một cột, viewport 360 px.
- Panel lượt hiện tại có viền đậm và số lớn; hàng chờ là danh sách số nhỏ hơn.
- CALLED và REGISTERING có nhãn chữ riêng, quầy bận/rảnh cũng ghi bằng chữ.

## Quy định hiển thị

| Tình huống | Lượt hiện tại | Hàng chờ | Nút gọi số tiếp theo |
| --- | --- | --- | --- |
| Quầy rảnh, có WAITING | Chưa có lượt, Quầy rảnh | Danh sách số | Bấm được |
| Có CALLED | Số, Đang gọi, Quầy bận | Danh sách số | Khóa, ghi lý do quầy bận |
| Có REGISTERING | Số, Đang tiếp nhận, Quầy bận | Danh sách số | Khóa, ghi lý do quầy bận |
| Hàng rỗng | Chưa có lượt, Quầy rảnh | Hàng chờ đang trống | Khóa, ghi lý do hàng rỗng |
| Chưa có phiên | Chưa có lượt | Chưa có hàng chờ, không đọc API quầy | Khóa, ghi lý do chưa có phiên |
| Phiên STOPPED | Như OPEN | Như OPEN | Như OPEN, vẫn xử lý phiếu cũ |
| Đang tải lần đầu | Thông báo đang tải toàn trang, chưa hiện panel | | Chưa hiện |
| Tải lần đầu lỗi | Báo lỗi và Thử tải lại, không có số | | Chưa hiện |
| Tải lại lỗi | Giữ dữ liệu cũ, cảnh báo kèm thời điểm | Giữ dữ liệu cũ | Khóa đến khi tải lại được |
| Đang gửi | Giữ nguyên, không tự đổi số | Giữ nguyên | Khóa, ghi Đang gọi… |
| 401 `UNAUTHENTICATED` | Báo cần đăng nhập tài khoản nhân viên, bỏ dữ liệu đang hiện | | Chưa hiện |
| 403 `FORBIDDEN` | Báo tài khoản không có quyền vận hành quầy, bỏ dữ liệu đang hiện | | Chưa hiện |

Kết quả thao tác hiển thị phía trên hai panel:

- Thành công: chỉ sau phản hồi API, số lấy từ Ticket trả về.
- `COUNTER_BUSY`, `QUEUE_EMPTY`, `INVALID_STATE`: nêu lý do từ chối, giữ thông báo
  sau khi tải lại.
- Lỗi khác hoặc mất phản hồi: báo chưa có xác nhận, không khẳng định đã gọi hay chưa.

Màn hình chỉ hiển thị số và thời gian. DTO Ticket v1.0 không có tên hoặc mã hồ
sơ, và UUID nội bộ không được hiện ra màn hình.

## Tệp và cách ghép

- `client/src/features/staff/StaffPage.jsx`: UI mock, export mặc định.
- `components/CurrentTicket.jsx`: lượt hiện tại, không suy ra quy tắc hàng chờ.
- `components/WaitingList.jsx`: hàng chờ theo đúng thứ tự máy chủ trả về.
- `mocks/staff.mock.js`: fixture và adapter Promise trả envelope `{data}`.
- `staff.css`: CSS chỉ trong phạm vi class `staff-`.

Sau khi có khung React của Trực, import `StaffPage` vào route `/staff` qua PR có
Trực phối hợp. Không tạo ứng dụng thứ hai, không sửa package, lockfile, route
chung, đăng nhập, phiên hoặc backend trong task này.

Vì SessionPanel (1.2) chưa có trong repo, StaffPage nhận panel qua prop
`sessionPanel`. Khi chưa truyền, khu vực phiên chỉ đọc từ mock và không có nút
phiên giả. Sau khi An bàn giao:

```jsx
import StaffPage from './features/staff/StaffPage.jsx';
import SessionPanel from './features/sessions/SessionPanel.jsx';

<StaffPage sessionPanel={<SessionPanel />} />
```

Khi đó cần chốt với An cách báo phiên đã đổi để StaffPage đọc lại hàng chờ; câu
hỏi này được ghi ở `docs/requirements/staff.md`.

Task 1.17 sẽ tạo `staff.api.js` qua `http.js` chung thay nguồn mock, giữ các
phương thức đang dùng và DTO OpenAPI:

| Phương thức | API thật |
| --- | --- |
| `getCurrentSession()` | `GET /sessions/current` |
| `getWaitingQueue({sessionId})` | `GET /queue/waiting?sessionId=...` |
| `getCurrentQueue({sessionId})` | `GET /queue/current?sessionId=...` |
| `callNext({sessionId})` | `POST /queue/call-next` |

UI đọc mã lỗi từ `error.code`, nên lỗi do `http.js` ném ra cần giữ `code` trong
envelope lỗi. Hiện không có request mạng, lưu bền hoặc polling.

## Dữ liệu và cách thử trạng thái

Mock mặc định có quầy rảnh và các số 5, 6, 7 đang chờ. Các số cố định chỉ phục
vụ UI; mock không triển khai FIFO, quyền hoặc khóa giao dịch. Tải lại trang tạo
lại dữ liệu mock; không coi đây là mất dữ liệu backend.

Preview/test có thể truyền `api` để thử trạng thái; không có menu debug trong
màn hình người dùng:

```jsx
import { createStaffMockApi } from './features/staff/mocks/staff.mock.js';

const previewApi = createStaffMockApi({ scenario: 'called', delay: 250 });
<StaffPage api={previewApi} />
```

Các scenario: `default`, `called`, `registering`, `empty-queue`, `no-session`,
`stopped-session`, `load-error`, `counter-busy`, `queue-empty`, `invalid-state`,
`call-error`, `call-error-then-offline`, `unauthenticated`, `forbidden`,
`session-expired`. Ba scenario cuối dùng mã lỗi và envelope
`{error: {code, message}}` của 1.4 (`docs/modules/auth.md`). Tạo adapter ngoài component để tránh
khởi tạo lại sau mỗi render. Không coi mock là kiểm tra quyền ở server.

## Bằng chứng và phần chờ

Ca thử/kết quả: `docs/testing/cases/1-16.md`.
Ảnh: `docs/testing/evidence/1-16/`.

Repo chưa có scripts/dependencies React ở thời điểm thực hiện. Kiểm tra UI dùng
harness tạm ngoài repo, không thay thế bước ghép/chạy lại trên khung 1.19. Khi
khung được bàn giao, dùng lệnh chạy/test thực tế trong README của nhóm, rồi chạy
lại các ca đã ghi.
