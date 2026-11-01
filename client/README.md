# Frontend React

Trực dựng cấu hình và hướng dẫn chạy ở 1.19; An duyệt kiến trúc. package.json ban đầu chỉ là metadata, chưa có scripts hoặc dependencies.

- app/: ghép ứng dụng và routes.jsx, Trực điều phối.
- shared/api/http.js: API client dùng chung; Trực phụ trách hạ tầng, Hưng phối hợp xác thực.
- shared/components/: thành phần UI thật sự dùng lại.
- features/auth/: Hưng, LoginPage.jsx và auth.api.js.
- features/patient/: Đạt, PatientPage.jsx và patient.api.js; mock để riêng trong mocks/.
- features/staff/: Trung, StaffPage.jsx và staff.api.js; import SessionPanel của An.
- features/sessions/: An, SessionPanel.jsx và session.api.js.
- features/public-board/: Trực, bảng không có danh tính.

Unit/component test nằm __tests__ cạnh feature. Không nối thẳng PostgreSQL hoặc đưa bí mật server vào client. Khi dùng API thật, bỏ nguồn mock khỏi luồng bàn giao.
