# Bàn giao Sprint 1 - phần của Phan Trung Trực

Cập nhật 19/11/2026. WBS 1.19, 1.20, 1.21. Bản bàn giao PR #9 tích hợp `main@70dfca1`.

## Trạng thái thực tế

| Phần | Bằng chứng | Trạng thái |
| --- | --- | --- |
| 1.19 - khung và nhật ký | PR #8 đã merge; npm ci, migration/seed chạy lại, test DB/cookie/restart; rollback Ticket/Event qua API thật | Đã kiểm tra lại cùng nền main mới nhất; chờ xác nhận nghiệm thu nhóm nếu chưa có |
| 1.20 - bảng công khai | [Báo cáo](../testing/cases/1-20.md), luồng `/patient` → `/staff` → `/board` và JSON ẩn danh | Đã tự kiểm tra trên bản ghép; chờ Trung review và An merge PR #9 |
| 1.11 và 1.17 - gọi số và màn hình quầy | PR #13 và #18 đã merge; các ca gọi số dùng API thật | Đã chạy cùng 1.20; chờ Trung đối chiếu độc lập |
| 1.21 - yêu cầu/tài liệu | PR #10 đã merge; An duyệt PLAT-01 đến PLAT-05 trên PR #9 | Tài liệu và bằng chứng cập nhật; chờ xác nhận hoạt động nhóm |
| Review phần An | [Review 1.1/1.2](../testing/reviews/1-21-sessions.md), đọc mã và thử UI quyền/mở phiên | Đã bổ sung review kỹ thuật 1.2; chưa gửi Approve hoặc xác nhận thay người khác |
| Demo/Review/Retro | Kịch bản bên dưới | Chưa có biên bản nhóm; kiểm tra kỹ thuật không thay buổi họp |
| Giờ thực tế | Trực ghi theo thời gian của mình | Chưa cung cấp; không dùng 8 giờ dự kiến làm số thực tế |

## Việc còn lại theo người

- Trực: xử lý phản hồi review và kiểm tra lại trên main sau khi PR #9 merge.
- Trung: đối chiếu số chờ/số đang gọi của `/staff` với `/board`; review PR #9.
- Hưng: rà JSON công khai và quyền truy cập trong bản tích hợp.
- An: nghiệm thu và merge theo quy trình.
- Cả nhóm: demo/review/retro, ghi kết quả và quyết định thật.

Đây là danh sách bàn giao, không khẳng định đã gửi tin nhắn hoặc những người trên đã xác nhận.

## Kịch bản demo sau tích hợp

1. Cài theo README trên DB demo riêng, migrate/seed, khởi động API và client.
2. Mở /board không đăng nhập; không có phiên thì bảng rỗng đúng hợp đồng.
3. staff_01 đăng nhập/mở phiên thật. rep_a đăng nhập, chọn hồ sơ được phép và lấy vé qua /patient.
4. Kiểm tra số chờ trên /board. Bấm gọi tại /staff, đối chiếu số đang gọi và các số còn chờ trên hai màn hình.
5. Đối chiếu JSON chỉ có currentTicket={number,status}|null, waitingNumbers, updatedAt; không ID/tên/hồ sơ.
6. Dừng API thử, xác nhận cảnh báo dữ liệu cũ; chạy lại, xác nhận tự phục hồi.
7. Ghi phiên bản, bước, kết quả, reviewer và phản hồi thật. Không dùng nút gọi mock hoặc SQL UPDATE làm bằng chứng gọi thật.

## Nội dung chuẩn bị cho retro

Ghi nhận xung đột tích hợp ở router chung, thời điểm bàn giao các API phụ thuộc và kết quả đối chiếu quầy/bảng. Ghi quyết định và người phụ trách sau buổi retro.

## Checklist trước khi đóng phần việc

- [x] Tích hợp `main@70dfca1`, giữ auth/patients/sessions/tickets/queue và thêm public board.
- [x] Bỏ fixture Ticket cũ, dùng migration thật, thử cấp vé và rollback Ticket/Event qua API.
- [x] Server 231/231 không SKIP; client 13/13 và build đạt.
- [x] Luồng lấy số → gọi tại quầy → bảng công khai và JSON ẩn danh đạt trên trình duyệt; hồi quy quầy, phiên và người bệnh đạt.
- [x] Bổ sung review kỹ thuật UI phiên 1.2 và cập nhật tài liệu.
- [x] An duyệt PLAT-01 đến PLAT-05.
- [ ] Trung review và đối chiếu độc lập với `/staff`; Hưng rà dữ liệu công khai.
- [ ] An merge PR #9; chạy lại kiểm tra trên main.
- [ ] Demo/Review/Retro có biên bản/xác nhận thực tế.
- [ ] Trực ghi giờ thực tế; An cập nhật tiến độ. Chưa tự đánh dấu Done.
