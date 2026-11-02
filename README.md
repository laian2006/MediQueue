# MediQueue

**Outpatient Registration Queue Management System — Nhóm 11, Intro to Software Engineering.**

Mô phỏng một quầy đăng ký ngoại trú và một hàng chờ thông thường, sử dụng dữ liệu giả lập. Kiến trúc đã chọn: React → Express → PostgreSQL.

## Trạng thái ban đầu

Repo có cấu trúc thư mục, quy ước và thiết kế chung. Mô đun phiên task **1.1** đã có migration, API mở/đọc và kiểm thử độc lập; xem [hướng dẫn ghép mô đun](docs/modules/sessions.md) và [kết quả thử](docs/testing/cases/1-1.md). Chưa ghép xác thực thật và app chung; chưa đánh dấu task Done. Hai package.json mới khai báo tên project, chưa có thư viện hoặc lệnh chạy. Trực hoàn thiện khung chạy, công cụ/phiên bản, scripts, kết nối DB và hướng dẫn ở **1.19**; An chốt yêu cầu/kiến trúc/API ở **1.3**. Cổng trong .env.example là giá trị phát triển dự kiến, được Trực chốt lại cùng README.

Không chạy các lệnh cài/chạy theo phỏng đoán. Sau 1.19, dùng đúng hướng dẫn được cập nhật tại đây. Tệp .gitkeep giữ các thư mục chưa có nội dung trên GitHub; có thể bỏ khi thư mục đã có tệp thật.

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

Kế hoạch gốc: [Sprint Plan VI](docs/planning/MediQueue_Group11_Sprint_Plan_VI.xlsx). Cập nhật kế hoạch có thống nhất khi thay đổi phạm vi/lịch; không âm thầm đổi giao việc.

## Phạm vi

Một hàng thông thường, tài khoản và hồ sơ giả lập. Không triển khai phân loại cấp cứu, bệnh án, BHYT, thanh toán hoặc tích hợp hệ thống bệnh viện. Mỗi máy dùng DB thử riêng với cùng migration/seed; DB tích hợp tách riêng và không reset khi chưa thống nhất.

## Điều kiện hoàn thành

Đạt AC, có kết quả test, được review, ghép vào main và chạy với mô đun liên quan, tài liệu đúng phiên bản, không còn lỗi chặn/lộ dữ liệu. Mục tiêu thử tải 50 client/5 phút, đọc mỗi 3 giây, p95 API ≤2 giây và cập nhật ≤5 giây là mục tiêu cần đo, chưa phải kết quả đã đạt.
