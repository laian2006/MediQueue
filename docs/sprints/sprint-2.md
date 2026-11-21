# Sprint 2 — Tiến độ và bàn giao của An

Đối chiếu GitHub ngày 21/11/2026. Sprint 2 theo kế hoạch là tuần 12–13, từ 16–29/11. Phân công, 20 giờ/người/sprint và các phụ thuộc giữ theo [Sprint Plan EN](../planning/MediQueue_Group11_Sprint_Plan.xlsx) và [WBS](../planning/task-map.md). Giờ thực tế và biên bản họp được bổ sung khi có xác nhận thực tế.

## Kết quả đã có

- Sprint 1 đã ghép đăng nhập, danh sách hồ sơ, lấy/xem số và gọi số thật trên PostgreSQL. API 1.10/1.11 vào main qua [#13](https://github.com/laian2006/MediQueue/pull/13), UI 1.17 qua [#18](https://github.com/laian2006/MediQueue/pull/18).
- Bảng công khai 1.20 đã ghép qua [#9](https://github.com/laian2006/MediQueue/pull/9) tại `56a946a` ngày 19/11. An chạy độc lập luồng lấy hai số từ `/patient`, gọi ở `/staff` rồi đối chiếu `/board` ẩn danh. Số đang gọi và hàng chờ khớp nhau. Luồng kỹ thuật chính Sprint 1 đã tích hợp, hồ sơ demo/retro và giờ thực tế tiếp tục ghi nhận theo hoạt động thật.
- API hủy WAITING 2.13 đã ghép qua [#15](https://github.com/laian2006/MediQueue/pull/15).
- Đức Anh 2.7 đã được Hưng approve và An kiểm tra bản ghép với `main@5d5940e`, backend 209/209 trên PostgreSQL 18. [#19](https://github.com/laian2006/MediQueue/pull/19) đã merge tại `f402cea`. Góp ý fixture router của Hưng được An sửa trong `1aa15b5`.
- Hưng 2.4 đã ghép qua [#20](https://github.com/laian2006/MediQueue/pull/20) tại `021e80b`. Middleware chặn sai vai trò trước handler; kiểm tra PatientAccess tiếp tục nằm ở service. An chốt giữ 404 cho phiếu không tồn tại và 403 cho hồ sơ ngoài quyền theo hợp đồng v1.0.
- Hoàng Anh 2.10 đã ghép qua [#21](https://github.com/laian2006/MediQueue/pull/21) tại `40d4c50`, backend 276/276. Ghi vắng 2.11 đã ghép qua [#22](https://github.com/laian2006/MediQueue/pull/22) tại `95b4d52`, backend 301/301. An review, chạy lại trên PostgreSQL 18.6 và dùng merge commit để giữ quan hệ phụ thuộc #21 → #22. Các trường trống trong mô tả PR và báo cáo đã được bổ sung bằng kết quả An thực sự chạy.

## Phần việc của An

- **2.1** Mã `b024364` bổ sung stop/close, khóa QueueSession và kiểm tra các phiếu hoạt động trong cùng giao dịch. STOPPED tiếp tục gọi/hủy phiếu cũ. Gửi lặp stop/close hợp lệ giữ nguyên audit. [AC](../requirements/sessions.md), [kiểm thử](../testing/cases/2-1.md)
- **2.2** Mã `c4f4411` bổ sung nút ngừng/đóng, khóa thao tác đang gửi, đối chiếu trạng thái sau lỗi và đồng bộ cửa sổ từ polling của StaffPage. Ngày 21/11, An bổ sung test `63bcda2` và kiểm tra FF với API 2.10/2.11 thật, gồm chờ thực tế T=60 giây, xử lý hết phiếu rồi đóng/mở phiên mới. Bộ tích hợp đạt 4/4. Trung tiếp tục kiểm tra toàn màn hình khi có nút 2.16/2.17. [Kiểm thử](../testing/cases/2-2.md)
- **2.3** Cập nhật mô đun phiên, AC, OpenAPI, README, kết quả kiểm tra và bàn giao phụ thuộc. Đã review/merge #19, #9, #20, #21 và #22; bổ sung kiểm tra test khởi tạo router, giới hạn số tệp test DB đồng thời và nghiệm thu phiên với API tiếp nhận/ghi vắng. Review chéo của Trực, demo/retro và giờ thực tế được ghi khi thực hiện. Phần quyền 2.5 còn chờ Hưng bàn giao.

Kết quả trên bản mã tổng hợp `1aa15b5` gồm backend 216/216, frontend 9/9, E2E phiên 7/7, quầy 12/12, người bệnh 5/5; build đạt. Các bài thử không có ca bị bỏ qua. Đây là kết quả kiểm tra kỹ thuật; không thay thế bằng chứng demo/retro hoặc đo tải Sprint 3.

Lần tích hợp ngày 19/11 có backend 248/248, frontend 13/13, E2E bảng công khai 1/1, quầy 12/12, phiên 7/7, người bệnh 5/5 và build đạt. [Báo cáo và log tích hợp](../testing/reviews/2026-11-19-integration.md).

Lần tích hợp ngày 21/11 có backend 301/301, frontend 13/13, build và năm bộ E2E đạt, lỗi 0 và bỏ qua 0. Bộ mới kiểm tra phiên với API hoàn tất/ghi vắng/hủy thật đạt 4/4. [Báo cáo và bằng chứng](../testing/reviews/2026-11-21-integration.md).

## Bàn giao theo người phụ trách

- **Hưng** Đã có 1.4–1.6, review #19 và ghép 2.4 qua #20. Tiếp tục 2.5 về nhiều đại diện, đăng xuất và chuyển tài khoản. Handler 2.10/2.11 đã có và các ca phân quyền trong bộ test vẫn đạt.
- **Đức Anh** 2.7 đã ghép. API stop của 2.1 sẵn để làm 2.8, kiểm tra cấp/ngừng đồng thời. Sửa trong router vẫn tương thích với `issue()` của caller cũ; router dùng `issueWithStatus()`.
- **Hoàng Anh** 1.10/1.11 và API 2.10/2.11 đã ghép, An đã kiểm tra. Bàn giao hợp đồng cho Trung, tiếp tục tài liệu/review 2.12 và phối hợp chạy toàn màn hình quầy. Phiên STOPPED vẫn xử lý phiếu; mọi thao tác ghi khóa phiên trước phiếu.
- **Đạt** 2.13 đã ghép. [#16](https://github.com/laian2006/MediQueue/pull/16) cho 2.14 vẫn Draft ở `b00bb25`. Cập nhật nhánh từ main có 2.7 và API phiên, nối hủy/polling thật, chạy lại E2E và báo rõ phần phụ thuộc 2.11.
- **Trung** 1.17 đã ghép. API 2.10/2.11 đã lên main để nối trực tiếp 2.16/2.17, gồm gọi lại/bắt đầu/hoàn tất và ghi vắng. `SessionPanel` đã có open/stop/close; giữ `currentSession` và callback `onSessionChange` khi cập nhật StaffPage. An đã kiểm tra phần phiên qua API thật, Trung còn nghiệm thu các nút nghiệp vụ mới trên quầy.
- **Trực** 1.20 đã ghép qua #9. Tiếp tục nhật ký/bảng đầy đủ 2.19, môi trường tích hợp 2.20 và tài liệu 2.21. Test backend qua `npm test` hiện giới hạn tối đa bốn tệp chạy song song; các ca cạnh tranh trong từng tệp vẫn chạy theo kịch bản đã viết.

Các task nêu trên giữ nguyên chủ trì và lịch trong Excel. Chưa thấy PR chỉ phản ánh bằng chứng trên GitHub; thành viên có thể đang làm ở máy riêng.

## Trình tự nghiệm thu tiếp theo

1. Dùng luồng `/patient` → `/staff` → `/board` đã ghép để thực hiện review/demo Sprint 1 và ghi kết quả thực tế.
2. 2.8 dùng API stop thật; 2.14 dùng API hủy và requestId thật; Hưng bàn giao 2.5.
3. Trung ghép 2.16/2.17 với API 2.10/2.11 đã có, chạy lại luồng đầy đủ qua các nút trên quầy. Phần FF 2.2 với API thật đã được An kiểm tra.
4. Ghi kết quả review/demo, phản hồi, việc chuyển tiếp và giờ thực tế vào hồ sơ sprint trước khi đánh dấu Done toàn bộ.
