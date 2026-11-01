# Quy trình làm việc chung

## Nhận task và gửi thay đổi

1. An tạo hoặc giao Issue theo WBS trong Excel. Giữ AC, giờ, phụ thuộc và đầu ra; mỗi Issue có một người chịu trách nhiệm chính.
2. Cập nhật main khi thư mục làm việc không còn thay đổi chưa xử lý. Tạo branch riêng, ví dụ `feat/1-13-patient-ui`; dùng `fix/` cho sửa lỗi, `docs/` cho tài liệu.
3. Thực hiện đúng feature/module của mình; tự chạy các ca liên quan theo README sau khi khung chạy được bàn giao.
4. Commit và push phần liên quan; tạo PR về main theo mẫu. Dùng `Refs #N` để tham chiếu Issue thực; chỉ `Closes #N` khi hoàn thành trọn Issue.
5. Yêu cầu reviewer đúng phân công. Sửa phản hồi trên cùng branch, push và yêu cầu xem lại. An merge sau review; phần An được Trực review.
6. Chạy lại phần tích hợp trên main rồi mới đóng Issue/Done. Sau merge nếu phát hiện lỗi, tạo branch/PR sửa mới và liên kết Issue.

Chỉ An merge là quy ước nhóm, không phải bảo vệ kỹ thuật đã được tự động cấu hình. Không dùng force push/reset/discard khi chưa hiểu; báo An để giữ công việc. Không tạo PR rỗng cho việc họp hoặc review, ghi bằng chứng trên Issue.

## Vòng review

Trực → An → Hưng → Đức Anh → Hoàng Anh → Đạt → Trung → Trực. Mũi tên nghĩa là người bên trái review phần của người bên phải.

## Tệp dùng chung

- Trực điều phối app/routes của client/server, pool/transaction/config, package.json và lockfile.
- Hưng chủ trì xác thực, middleware quyền và cơ chế xác thực trong http.js; Trực giữ hạ tầng API client.
- An điều phối hợp đồng `docs/api/openapi.yaml`, kiến trúc và ERD khi các tệp này được tạo trong sprint 1.
- Chủ task được đề xuất thay đổi tệp chung trong PR nhưng phải báo chủ điều phối và bên nhận; không tự đổi cấu trúc toàn project.

Thống nhất JavaScript, React .jsx; thành phần PascalCase, module chữ thường. Chốt một trình quản lý gói và một lockfile cho mỗi package ở 1.19; người khác dùng cùng công cụ, không tự tạo lockfile loại khác.

## Phụ thuộc và bàn giao

FS: xong task trước mới bắt đầu task sau. FF: có thể làm song song nhưng phần phụ thuộc phải xong trước khi nghiệm thu. UI mock phải khớp hợp đồng; bằng chứng API thật phải chạy server/PostgreSQL thật.

Mỗi cập nhật Issue ghi: đã xong, bước tiếp, blocker/cần ai, link branch/PR, giờ thực tế lũy kế và giờ còn lại. Không tính giờ chuẩn bị tuần 9 trùng vào 20 giờ sprint.

## Test và dữ liệu

Unit/component test đặt cạnh feature/module trong __tests__; API/DB test ở server/tests/integration; toàn luồng ở tests/e2e; tải ở tests/load. Chốt công cụ/lệnh ở 1.19, không tự thêm framework khác.

Ca thử và kết quả ở `docs/testing/cases/<WBS dùng gạch nối>.md`; ảnh/tệp bằng chứng ở `docs/testing/evidence/<WBS dùng gạch nối>/`. Ghi commit, dữ liệu đầu, bước, mong đợi, thực tế, đạt/chưa đạt. Chưa chạy ghi rõ Chưa chạy; không đưa token hay dữ liệu thật vào bằng chứng.

Migration đã áp dụng trên main không sửa lại; bổ sung migration mới sau khi An/Trực chốt số thứ tự. Xem database/README.md về cách ghép TicketEvent với Ticket.

Không commit .env, mật khẩu thật, node_modules hay bản build. Thay đổi API/schema phải cập nhật tài liệu và test cùng PR, báo người bị ảnh hưởng.
