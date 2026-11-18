# Yêu cầu quản lý phiên

Chủ trì An. Căn cứ thiết kế chung v1.0 và WBS 1.1–1.3, 2.1–2.3.

Nhân viên cần mở một phiên, ngừng cấp số mới và đóng sau khi xử lý hết phiếu để giữ hàng chờ nhất quán giữa các màn hình.

- **SES-01** Tối đa một phiên OPEN hoặc STOPPED. Mở thêm trả 409 `SESSION_ALREADY_ACTIVE`. Phiên mới bắt đầu bộ đếm 0 và giữ lịch sử phiên cũ.
- **SES-02** Tài khoản đã đăng nhập đọc phiên hiện tại. Chỉ STAFF mở/ngừng/đóng; kiểm tra quyền ở API và service. UUID sai trả 400, phiên không tồn tại trả 404.
- **SES-03** OPEN chuyển STOPPED. Phiên STOPPED từ chối cấp mới nhưng vẫn cho gọi/hủy/xử lý phiếu cũ theo quyền và trạng thái phiếu. Gửi lại cùng requestId đã lưu tuân theo 2.7.
- **SES-04** Chỉ STOPPED hết WAITING/CALLED/REGISTERING mới đóng. CLOSE từ OPEN trả `INVALID_STATE`; còn phiếu hoạt động trả `ACTIVE_TICKETS_REMAIN`. Gửi lại stop trên STOPPED hoặc close trên CLOSED trả 200 và giữ audit ban đầu.
- **SES-05** Ngừng/đóng và các thao tác phiếu cùng khóa QueueSession trước Ticket. Kết quả cạnh tranh cấp/ngừng, hủy/đóng phải giữ trạng thái và bộ đếm hợp lệ; không tự kết thúc hoặc xóa phiếu để đóng phiên.
- **SES-06** SessionPanel dùng API thật, khóa thao tác đang gửi, thông báo lỗi cụ thể và đọc lại sau xung đột/mất phản hồi. Màn hình quầy đồng bộ phiên từ bản đọc định kỳ của StaffPage. Giao diện dùng được ở 360 px.
- **SES-07** Đóng sau luồng ghi vắng/tiếp nhận đầy đủ cần nghiệm thu với 2.10, 2.11, 2.16 và 2.17. Các bài thử dùng trạng thái chuẩn bị bằng SQL phải ghi rõ là fixture.

SES-01/02 đã có bằng chứng 1.1, 1.2. SES-03–05 được đối chiếu ở [ca 2.1](../testing/cases/2-1.md), SES-06 ở [ca 2.2](../testing/cases/2-2.md). SES-07 đang chờ các mô đun liên quan.
