# Thiết kế UI người bệnh task 1.13

Chủ trì: Đặng Thành Đạt. Reviewer: Hồ Sỹ Hoàng Anh.

Trạng thái: bản nháp, dùng mock theo thiết kế v1.0. Chờ An xác nhận user
stories/AC ở nhánh `task/1.15`, Hoàng Anh review và Trực bàn giao khung 1.19
để ghép vào ứng dụng. Chưa có bằng chứng tích hợp API/PostgreSQL hoặc Done.

## Luồng và wireframe

Đăng nhập (Hưng, ngoài phạm vi 1.13) → chọn hồ sơ được phép → đọc phiên
hiện tại → xem phiếu hoạt động hoặc lấy số → hiển thị TicketView.

- `wireframe-desktop.svg`: bố cục hai cột hồ sơ và phiếu.
- `wireframe-mobile.svg`: cùng nội dung theo một cột, viewport 360 px.
- Tên/mã hồ sơ đang chọn luôn rõ; đổi hồ sơ xóa phiếu cũ ngay.
- WAITING và CALLED có nhãn và giải thích bằng chữ.
- Các trạng thái tải, rỗng, chưa có phiên, ngừng nhận số và lỗi không báo
  lấy số thành công khi chưa có phản hồi.

## Tệp và cách ghép

- `client/src/features/patient/PatientPage.jsx`: UI mock, export mặc định.
- `components/TicketCard.jsx`: hiển thị TicketView, không suy ra quy tắc hàng chờ.
- `mocks/patient.mock.js`: fixture và adapter Promise trả envelope `{data}`.
- `patient.css`: CSS chỉ trong phạm vi class `patient-`.

Sau khi có khung React của Trực, import `PatientPage` vào route `/patient`
qua PR có Trực phối hợp. Không tạo ứng dụng thứ hai, không sửa package,
lockfile, route chung, đăng nhập hoặc backend trong task này.

```jsx
import PatientPage from './features/patient/PatientPage.jsx';

// Phần ghép vào route do Trực điều phối trong khung chung.
<PatientPage />
```

Trong môi trường React dùng JSX transform cũ, bundler cần cấu hình JSX
automatic theo khung được Trực chốt. Không cài thêm framework cho feature.

Task 1.14 sẽ dùng `http.js` chung thay nguồn mock. Các phương thức đang dùng:
`getPatients()`, `getCurrentSession()`, `getActiveTicket({patientId, sessionId})`,
`issueTicket({patientId, sessionId, requestId})`; phản hồi giữ DTO OpenAPI.
Hiện không có request mạng, lưu bền, polling hoặc hủy phiếu.

## Dữ liệu và cách thử trạng thái

Mock mặc định có P001 WAITING số 12, P002 chưa có phiếu và P003 CALLED số 7.
Chọn P002 rồi lấy số để xem phản hồi fixture WAITING số 13. Các số cố định
chỉ phục vụ UI; mock không triển khai thuật toán cấp số hoặc phân quyền.
Tải lại trang tạo lại dữ liệu mock; không coi đây là mất dữ liệu backend.

Preview/test có thể truyền `api` để thử lỗi và độ trễ; không có menu debug
trong màn hình người dùng:

```jsx
import { createPatientMockApi } from './features/patient/mocks/patient.mock.js';

const previewApi = createPatientMockApi({ scenario: 'patients-error', delay: 250 });
<PatientPage api={previewApi} />
```

Các scenario: `default`, `empty-patients`, `patients-error`, `ticket-error`,
`no-session`, `stopped-session`, `issue-error`. Tạo adapter ngoài component để
tránh khởi tạo lại sau mỗi render. Không coi mock là kiểm tra quyền ở server.

## Bằng chứng và phần chờ

Ca thử/kết quả: `docs/testing/cases/1-13.md`.
Ảnh: `docs/testing/evidence/1-13/`.

Repo chưa có scripts/dependencies React ở thời điểm thực hiện. Kiểm tra UI
dùng harness tạm ngoài repo (React 18.3.1, ReactDOM 18.3.1, esbuild 0.24.2,
Playwright kèm runtime, Chrome trên máy). Harness không được đưa vào repo và
không thay thế bước ghép/chạy lại trên khung 1.19. Khi khung được bàn giao,
dùng lệnh chạy/test thực tế trong README của nhóm, rồi chạy lại các ca đã ghi.
