# Phạm vi và yêu cầu MediQueue

Phiên bản 1.0 ban hành ngày 01/11/2026 — **ÁP DỤNG TRIỂN KHAI**. Mỗi bạn bổ sung user stories/AC mô đun trong task chung sprint 1; An tổng hợp. Việc ban hành thiết kế không thay thế bằng chứng hoàn thành task.

## Phạm vi

Một quầy đăng ký ngoại trú, một hàng thông thường, dữ liệu giả lập. Tài khoản/hồ sơ/quyền seed sẵn; không có tự đăng ký/cấp quyền trên UI. Chưa làm cấp cứu/ưu tiên, bệnh án, BHYT, thanh toán, đặt lịch hoặc tích hợp bệnh viện. COMPLETED là xong đăng ký tại quầy.

## User stories và AC cốt lõi

- Người đại diện đăng nhập và chọn đúng hồ sơ được phép; ngoài PatientAccess bị từ chối. Hưng 1.4–1.5, 2.4–2.5; Đạt tích hợp UI.
- Người đại diện lấy/xem số trong OPEN; số duy nhất và một phiếu hoạt động theo patientId/sessionId. Đức Anh 1.7–1.8, 2.7–2.8.
- Khi mạng lỗi, người đại diện thử lại cùng body/requestId và nhận cùng phiếu; khác nội dung cùng khóa báo 409. Đức Anh 2.7, Đạt 2.14.
- Đại diện có quyền hủy WAITING; phiếu đã gọi không hủy, gọi/hủy cạnh tranh có một trạng thái cuối hợp lệ. Đạt 2.13; Hoàng Anh phối hợp.
- Nhân viên mở/ngừng/đóng phiên; chỉ một phiên chưa đóng, STOPPED không cấp mới nhưng xử lý phiếu cũ, hết phiếu mới đóng. An 1.1–1.2, 2.1–2.2.
- Nhân viên gọi FIFO khi rảnh, gọi lại giữ số, bắt đầu/hoàn tất và ghi vắng đúng T. Hoàng Anh 1.10–1.11, 2.10–2.11; Trung UI.
- Người xem công khai chỉ thấy số/trạng thái/thời điểm, JSON không có tên hoặc ID nội bộ. Trực 1.20, 2.19.

## Mục tiêu chất lượng và nghiệm thu

Yêu cầu chi tiết phần Trực tại [khung, nhật ký và bảng công khai](platform.md). An đã duyệt PLAT-01 đến PLAT-05 và nghiệm thu phần tích hợp bảng công khai qua PR #9 ngày 19/11/2026. Demo/retro và giờ thực tế của nhóm tiếp tục được ghi nhận theo hoạt động đã diễn ra.

50 client trong 5 phút, polling 3 giây; mục tiêu p95 API ≤2 giây, UI cập nhật ≤5 giây trong điều kiện thử bình thường. Chưa có kết quả đo. Lưu bền sau API restart, rollback nguyên tử, quyền không lẫn tài khoản/hồ sơ, cài sạch được theo README.

Giữ lịch sprint 1 tuần 10–11, sprint 2 tuần 12–13, sprint 3 tuần 14–15; tuần 16 demo. Các phần sửa chức năng xong trước hết thứ tư tuần 15; Trực 3.20 thứ năm–sáu rồi An 3.3 nghiệm thu. Mỗi người 20 giờ/sprint; chuẩn bị tuần 9/demo tuần 16 tính riêng theo Excel.
