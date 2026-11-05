# Bàn giao Sprint 1 — phần của Phan Trung Trực

WBS: 1.19, 1.20, 1.21. Ngày cập nhật: 05/11/2026. Lịch trong kế hoạch: Sprint 1 tuần 10–11; task 1.21 từ 02–13/11. Giờ dự kiến 8 giờ cho 1.21 là phân bổ công việc, không phải giờ thực tế đã ghi nhận.

## Bằng chứng hiện có

| Phần 1.21 | Đầu ra/bằng chứng | Trạng thái |
| --- | --- | --- |
| Yêu cầu module | [platform requirements](../requirements/platform.md) | Đã bổ sung, chờ An duyệt; không ghi đã duyệt trước code |
| Module/API docs | [platform module](../modules/platform.md), README/code/test trên nhánh 1.19 và 1.20 | Đã viết, chờ reviewer |
| Review chéo | [review kỹ thuật phần An](../testing/reviews/1-21-sessions.md) | 1.1 đã đọc/thử cùng khung; 1.2 chưa có mã để review |
| Tích hợp khung | Auth thật + phiên + PostgreSQL, test cookie/restart/đồng thời | Đã kiểm tra trên nhánh bàn giao, chưa chạy lại sau merge main |
| Tích hợp bảng | SQL/DTO/UI/polling trên PostgreSQL thật với fixture Ticket | Đã kiểm tra; chờ API 1.8/1.11 và schema 003/004 để thử toàn luồng |
| Demo, Sprint Review, Retrospective | Kịch bản/checklist bên dưới | Đã chuẩn bị; chưa diễn ra, chưa có biên bản/xác nhận nhóm |
| Giờ thực tế | Do Trực ghi theo thời gian làm việc của mình | Chưa cung cấp, không tự điền 8 giờ |

## Bàn giao theo người nhận

- An: yêu cầu/AC chờ duyệt, nhánh 1.19/1.20 và trạng thái tích hợp; cần review/merge theo quy trình. Không tự merge thay An.
- Hưng: cookie/Origin/http.js đã ghép; cần rà lại allowlist JSON công khai cùng Trực khi nghiệm thu.
- Đức Anh: pool/transaction/helper và thiết kế 004 trên 1.19; ghép 003/004, API 1.8, thử rollback Ticket/Event thật.
- Hoàng Anh: service gọi dùng cùng transaction/helper; cung cấp API 1.11 và dữ liệu cập nhật Ticket để kiểm tra bảng.
- Đạt/Trung: routes chung và API client có sẵn; Trung đối chiếu số hiện tại/hàng chờ của console với bảng công khai và review phần Trực.

Danh sách này là nội dung cần bàn giao; chưa khẳng định đã gửi tin nhắn hoặc thành viên đã nhận/xác nhận.

## Kịch bản demo sau khi phụ thuộc được ghép

1. Cài sạch theo README trên DB thử riêng, chạy migration/seed và khởi động client/server.
2. Mở `/board` ở cửa sổ không đăng nhập. Không có phiên thì số hiện tại rỗng, không có số chờ; JSON không có danh tính.
3. STAFF đăng nhập/mở phiên; đại diện đăng nhập và lấy phiếu qua API/UI thật của các chủ mô đun. So sánh số đã lưu với bảng.
4. STAFF gọi tiếp qua API/UI 1.11/1.17. Bảng tự cập nhật cùng số; phiếu được gọi rời danh sách chờ. Trung đối chiếu console.
5. Kiểm tra JSON công khai bằng Network: chỉ currentTicket={number,status}|null, waitingNumbers, updatedAt; không UUID/ID/tên/hồ sơ.
6. Dừng API thử: bảng báo mất kết nối/dữ liệu có thể đã cũ. Chạy lại: bảng tự phục hồi, không tự cấp/đổi số.
7. Ghi commit, DB/migration, bước và kết quả thật vào ca kiểm tra; reviewer xác nhận, An nghiệm thu sau khi ghép main.

Không dùng SQL UPDATE hoặc UI mock trong bước 3–4 để thay bằng chứng toàn luồng. Bản kiểm tra 1.20 hiện dùng dữ liệu thử trực tiếp và đã ghi rõ giới hạn đó.

## Nội dung để nhóm thảo luận trong retro

- Điểm thuận lợi quan sát được: khung auth/phiên dùng một pool và hợp đồng chung; helper bàn giao độc lập khi Ticket chưa có; test có schema riêng.
- Vấn đề còn mở: nhánh khung chưa merge làm các task sau chưa thử được trên main; API 1.8/1.11 và UI phiên 1.2 chưa có tại thời điểm kiểm tra.
- Đề xuất để nhóm quyết định: ưu tiên review/merge 1.19, chốt bàn giao schema/API và một buổi kiểm tra số giữa console/bảng công khai.
- Chưa có quyết định/owner/thời hạn được nhóm xác nhận. Đây là nội dung chuẩn bị, không phải biên bản họp đã diễn ra.

## Checklist còn lại trước khi đóng 1.21

- [ ] An duyệt user stories/AC của Trực.
- [ ] Trung review các thay đổi khung/bảng/tài liệu của Trực.
- [ ] Trực review UI 1.2 khi An bàn giao; xử lý phản hồi review có thật.
- [ ] Ghép các phụ thuộc, chạy luồng lấy/gọi số thật và đối chiếu với Trung/Hưng.
- [ ] Chạy lại kiểm tra trên main sau merge.
- [ ] Tham gia demo/review/retro và ghi biên bản/xác nhận thực tế.
- [ ] Trực ghi giờ thực tế, An cập nhật tiến độ theo quy trình; chưa tự đánh dấu Done.
