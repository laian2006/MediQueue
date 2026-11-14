# Bàn giao Sprint 1 - phần của Phan Trung Trực

Cập nhật 14/11/2026. WBS 1.19, 1.20, 1.21. Nền tích hợp main b8bae9e; báo cáo này đi cùng PR #9 đang mở, không push tiếp các nhánh 1.19/1.21 đã merge.

## Trạng thái thực tế

| Phần | Bằng chứng | Trạng thái |
| --- | --- | --- |
| 1.19 - khung và nhật ký | PR #8 đã merge; npm ci, migration/seed chạy lại, test DB/cookie/restart; rollback Ticket/Event qua API thật | Đã kiểm tra lại cùng nền main mới nhất; chờ xác nhận nghiệm thu nhóm nếu chưa có |
| 1.20 - bảng công khai | [Báo cáo](../testing/cases/1-20.md), API/UI/polling/privacy, test cấp vé thật | Code và test đã cập nhật; PR #9 chưa merge |
| 1.11 - phụ thuộc gọi số | PR #13, commit 258fbf1; ghép thử riêng với 1.20 đạt 5/5 | Chưa merge main; không tính bản thử là nghiệm thu main |
| 1.21 - yêu cầu/tài liệu | PR #10 đã merge; tài liệu bàn giao được cập nhật theo tích hợp 1.20 | Chờ An xác nhận AC và Trung review |
| Review phần An | [Review 1.1/1.2](../testing/reviews/1-21-sessions.md), đọc mã và thử UI quyền/mở phiên | Đã bổ sung review kỹ thuật 1.2; chưa gửi Approve hoặc xác nhận thay người khác |
| Demo/Review/Retro | Kịch bản bên dưới | Chưa có biên bản nhóm; kiểm tra kỹ thuật không thay buổi họp |
| Giờ thực tế | Trực ghi theo thời gian của mình | Chưa cung cấp; không dùng 8 giờ dự kiến làm số thực tế |

## Việc còn lại theo người

- Trực: cập nhật nhánh với main sau khi 1.11 merge; chạy lại ca gọi thật và kiểm tra sau khi PR #9 merge.
- Hoàng Anh/An: hoàn tất review/merge PR #13 (1.11).
- Trung: tích hợp console 1.17, đối chiếu số chờ/số đang gọi với /board; review PR #9.
- Hưng: rà JSON công khai và quyền truy cập trong bản tích hợp.
- An: duyệt user stories/AC và nghiệm thu theo quy trình.
- Cả nhóm: demo/review/retro, ghi kết quả và quyết định thật.

Đây là danh sách bàn giao, không khẳng định đã gửi tin nhắn hoặc những người trên đã xác nhận.

## Kịch bản demo sau tích hợp

1. Cài theo README trên DB demo riêng, migrate/seed, khởi động API và client.
2. Mở /board không đăng nhập; không có phiên thì bảng rỗng đúng hợp đồng.
3. staff_01 đăng nhập/mở phiên thật. rep_a đăng nhập, chọn hồ sơ được phép và lấy vé qua /patient.
4. Kiểm tra số chờ trên /board. Gọi qua API 1.11 thật (hoặc console 1.17 sau khi ghép), bảng tự chuyển số sang CALLED và bỏ khỏi hàng chờ.
5. Đối chiếu JSON chỉ có currentTicket={number,status}|null, waitingNumbers, updatedAt; không ID/tên/hồ sơ.
6. Dừng API thử, xác nhận cảnh báo dữ liệu cũ; chạy lại, xác nhận tự phục hồi.
7. Ghi phiên bản, bước, kết quả, reviewer và phản hồi thật. Không dùng nút gọi mock hoặc SQL UPDATE làm bằng chứng gọi thật.

## Nội dung chuẩn bị cho retro

Khung, schema 003/004 và API cấp vé đã vào main; bảng công khai ghép thử với API gọi số thành công. Điểm còn chặn nghiệm thu là 1.11 chưa merge và console 1.17 chưa nối API. Đề xuất nhóm ưu tiên một bản main có cả hai và một lượt đối chiếu console/bảng. Đây là đề xuất, chưa phải quyết định đã được nhóm đồng ý.

## Checklist trước khi đóng phần việc

- [x] Cập nhật bảng công khai với nền main b8bae9e, giữ routes login/patient/staff/SessionPanel.
- [x] Bỏ fixture Ticket cũ, dùng migration thật, thử cấp vé và rollback Ticket/Event qua API.
- [x] Client 11/11 và build đạt; server 156 đạt, 0 lỗi, 1 ca gọi thật chờ 1.11.
- [x] Thử API gọi số từ PR #13 trong bản riêng: 5/5 đạt; không merge thay chủ module.
- [x] Bổ sung review kỹ thuật UI phiên 1.2 và cập nhật tài liệu.
- [ ] An duyệt AC; Trung review; Hưng xác nhận dữ liệu công khai.
- [ ] Ghép 1.11 vào main, chạy lại gọi thật không SKIP; đối chiếu console 1.17 với Trung.
- [ ] An merge PR #9; chạy lại kiểm tra trên main.
- [ ] Demo/Review/Retro có biên bản/xác nhận thực tế.
- [ ] Trực ghi giờ thực tế; An cập nhật tiến độ. Chưa tự đánh dấu Done.
