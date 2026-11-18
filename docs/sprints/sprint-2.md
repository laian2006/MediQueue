# Sprint 2 — Tiến độ và bàn giao của An

Đối chiếu GitHub ngày 18/11/2026. Sprint 2 theo kế hoạch là tuần 12–13, từ 16–29/11. Phân công, 20 giờ/người/sprint và các phụ thuộc giữ theo [Sprint Plan EN](../planning/MediQueue_Group11_Sprint_Plan.xlsx) và [WBS](../planning/task-map.md). Giờ thực tế và biên bản họp được bổ sung khi có xác nhận thực tế.

## Kết quả đã có

- Sprint 1 đã ghép đăng nhập, danh sách hồ sơ, lấy/xem số và gọi số thật trên PostgreSQL. API 1.10/1.11 vào main qua [#13](https://github.com/laian2006/MediQueue/pull/13), UI 1.17 qua [#18](https://github.com/laian2006/MediQueue/pull/18).
- Sprint 1 còn bảng công khai 1.20 và đối chiếu staff/board. [#9](https://github.com/laian2006/MediQueue/pull/9) vẫn Draft ở `8720a19`, chưa cập nhật theo main đã ghép API gọi số. Việc này đang chặn nghiệm thu luồng công khai.
- API hủy WAITING 2.13 đã ghép qua [#15](https://github.com/laian2006/MediQueue/pull/15).
- Đức Anh 2.7 đã được Hưng approve và An kiểm tra bản ghép với `main@5d5940e`, backend 209/209 trên PostgreSQL 18. [#19](https://github.com/laian2006/MediQueue/pull/19) đã merge tại `f402cea`. Góp ý fixture router của Hưng được An sửa trong `1aa15b5`.

## Phần việc của An

- **2.1** Mã `b024364` bổ sung stop/close, khóa QueueSession và kiểm tra các phiếu hoạt động trong cùng giao dịch. STOPPED tiếp tục gọi/hủy phiếu cũ. Gửi lặp stop/close hợp lệ giữ nguyên audit. [AC](../requirements/sessions.md), [kiểm thử](../testing/cases/2-1.md)
- **2.2** Mã `c4f4411` bổ sung nút ngừng/đóng, khóa thao tác đang gửi, đối chiếu trạng thái sau lỗi và đồng bộ cửa sổ từ polling của StaffPage. Kiểm tra phần đã có đạt; nghiệm thu FF còn chờ 2.11 và đối chiếu với luồng quầy đầy đủ. [Kiểm thử](../testing/cases/2-2.md)
- **2.3** Cập nhật mô đun phiên, AC, OpenAPI, README, kết quả kiểm tra và bàn giao phụ thuộc. Đã review/merge #19. Review chéo của Trực, demo/retro và giờ thực tế được ghi khi thực hiện. Nghiệm thu các phần quyền 2.4/2.5 còn chờ Hưng bàn giao.

Kết quả trên bản mã tổng hợp `1aa15b5` gồm backend 216/216, frontend 9/9, E2E phiên 7/7, quầy 12/12, người bệnh 5/5; build đạt. Các bài thử không có ca bị bỏ qua. Đây là kết quả kiểm tra kỹ thuật; không thay thế bằng chứng demo/retro hoặc đo tải Sprint 3.

## Bàn giao theo người phụ trách

- **Hưng** Đã có 1.4–1.6 và review #19. Tiếp tục 2.4/2.5, ma trận quyền nhiều đại diện và chuyển tài khoản/đăng xuất. Chưa có PR công khai trong repo cho hai task này tại lần kiểm tra.
- **Đức Anh** 2.7 đã ghép. API stop của 2.1 sẵn để làm 2.8, kiểm tra cấp/ngừng đồng thời. Sửa trong router vẫn tương thích với `issue()` của caller cũ; router dùng `issueWithStatus()`.
- **Hoàng Anh** 1.10/1.11 đã ghép. Tiếp tục 2.10 gọi lại/bắt đầu/hoàn tất và 2.11 ghi vắng. Phiên STOPPED vẫn xử lý phiếu; mọi thao tác ghi tiếp tục khóa phiên trước phiếu.
- **Đạt** 2.13 đã ghép. [#16](https://github.com/laian2006/MediQueue/pull/16) cho 2.14 vẫn Draft ở `b00bb25`. Cập nhật nhánh từ main có 2.7 và API phiên, nối hủy/polling thật, chạy lại E2E và báo rõ phần phụ thuộc 2.11.
- **Trung** 1.17 đã ghép. Tiếp tục 2.16/2.17 theo API Hoàng Anh. `SessionPanel` đã có open/stop/close; `StaffPage` truyền thêm `currentSession` từ snapshot và giữ callback `onSessionChange`. Trung review #9 theo phân công và đối chiếu staff/board khi Trực cập nhật.
- **Trực** Ưu tiên cập nhật #9, xử lý router và test khung theo main, chạy luồng lấy/gọi số thật và kiểm tra JSON công khai chỉ có số/trạng thái. Review phần phiên 2.1/2.2 của An theo phân công. Sau đó tiếp tục 2.19/2.20 và tài liệu 2.21.

Các task nêu trên giữ nguyên chủ trì và lịch trong Excel. Chưa thấy PR chỉ phản ánh bằng chứng trên GitHub; thành viên có thể đang làm ở máy riêng.

## Trình tự nghiệm thu tiếp theo

1. #9 ghép bảng công khai và kiểm tra đồng bộ với `/staff` để hoàn tất luồng Sprint 1.
2. 2.8 dùng API stop thật; 2.14 dùng API hủy và requestId thật; Hưng bàn giao 2.4/2.5.
3. Ghép 2.10/2.11 với 2.16/2.17, chạy luồng ngừng → xử lý hết → đóng → mở phiên mới để nghiệm thu FF của 2.2.
4. Ghi kết quả review/demo, phản hồi, việc chuyển tiếp và giờ thực tế vào hồ sơ sprint trước khi đánh dấu Done toàn bộ.
