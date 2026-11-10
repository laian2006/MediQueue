# Frontend React

Khung task 1.19 dùng React 19, React Router 7 và Vite 8. Cài `npm ci`, chạy `npm run dev`, mở http://localhost:5173. Node >=22.12, khuyến nghị 24. `npm test` chạy test API client bằng node:test, `npm run build` tạo dist, `npm run preview` xem build tại 5173 (dừng dev trước). Hướng dẫn DB/API ở [README gốc](../README.md).

- app/: ghép ứng dụng và routes.jsx, Trực điều phối.
- shared/api/http.js: API client dùng chung; Trực phụ trách hạ tầng, Hưng phối hợp xác thực.
- shared/components/: thành phần UI thật sự dùng lại.
- features/auth/: Hưng, LoginPage.jsx và auth.api.js.
- features/patient/: Đạt, PatientPage.jsx và patient.api.js; mock để riêng trong mocks/.
- features/staff/: Trung, StaffPage.jsx và staff.api.js; import SessionPanel của An.
- features/sessions/: An, SessionPanel.jsx và session.api.js.
- features/public-board/: Trực, bảng không có danh tính.

Unit/component test nằm __tests__ cạnh feature. Không nối thẳng PostgreSQL hoặc đưa bí mật server vào client. Khi dùng API thật, bỏ nguồn mock khỏi luồng bàn giao.

`src/app/routes.jsx` hiện có `/` kiểm tra kết nối DB thật qua API và `/patient-demo` để xem UI mock 1.13. Không gán UI mock vào luồng thật. Chủ feature thêm route vào file chung theo PR; chưa có LoginPage, StaffPage, bảng công khai trong 1.19.

API client giữ nguyên envelope `{data: ...}`; gửi cookie bằng `credentials: 'include'`, JSON cho body, hỗ trợ AbortSignal và lỗi ApiError có status/code/details:

```js
import { http } from '../../shared/api/http.js';
const { data } = await http.get('/sessions/current', { signal });
const login = await http.post('/auth/login', { username, password });
```

`VITE_API_BASE_URL` mặc định `/api/v1`. `API_PROXY_TARGET` chỉ dùng tại dev/preview, mặc định http://localhost:3000. Chỉ đặt biến công khai trong VITE_*. Trình duyệt đi qua Vite proxy; không tự sao chép token hoặc danh tính vào header. Giao diện đăng nhập và nối API riêng vẫn do chủ task 1.5/1.14 triển khai.
