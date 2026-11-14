# Sprint 1 · Bàn giao của An

Đối chiếu lần đầu ngày 12/11/2026 trên `main` tại `7a90974`, cập nhật ngày 14/11. Sprint 1 kéo dài từ 02–15/11, các đầu việc tổng hợp theo kế hoạch có hạn 13/11. Tài liệu này ghi kết quả rà soát và chuẩn bị buổi review, chưa có biên bản họp hoặc giờ thực tế được xác nhận.

## Yêu cầu và kiến trúc đã rà soát

- Phạm vi là một quầy, một hàng chờ thông thường và dữ liệu mô phỏng. Dùng [phạm vi](../requirements/scope.md), [thiết kế chung v1.0](../architecture/shared-design-v1.0.md), [hợp đồng OpenAPI](../api/openapi.yaml) và [bảng phân công WBS](../planning/task-map.md) làm căn cứ triển khai.
- **1.1 và 1.2:** Nhân viên mở và xem phiên trên cùng ứng dụng. API xác thực từ cookie, chỉ STAFF được mở phiên, PostgreSQL bảo đảm chỉ có một phiên OPEN hoặc STOPPED. Khi có xung đột, giao diện đọc lại trạng thái từ máy chủ. [Tài liệu mô đun phiên](../modules/sessions.md)
- **1.4 và 1.5:** API hồ sơ lấy danh tính từ phiên đăng nhập và chỉ trả hồ sơ được cấp quyền. Đạt dùng `GET /patients` để thay dữ liệu mô phỏng khi tích hợp 1.14. [Tài liệu xác thực](../modules/auth.md)
- **1.17:** Trung ghép `SessionPanel` qua `onSessionChange` và đọc lại phiên/hàng đợi khi mở phiên thành công. Hiển thị số thứ tự theo `TicketView` v1.0. Các quyết định về polling và lỗi API đã ghi trong [chốt thiết kế màn hình quầy](../design/staff/design-decisions.md).

## Bằng chứng review và việc cần xử lý trước demo

- **1.1** đã có mã và migration trên `main`. Môi trường app chung có xác thực thật, PostgreSQL và test mở phiên đồng thời. Xem [ca thử 1.1](../testing/cases/1-1.md) và [review của Trực](../testing/reviews/1-21-sessions.md).
- **1.2** đã chạy 5 ca trình duyệt với PostgreSQL 18. Hai cửa sổ mở đồng thời nhận 201 và 409, sau đó cùng hiển thị một phiên OPEN. An quyết định ghép trực tiếp sau khi kiểm tra lại cùng 1.14. [Ca thử 1.2](../testing/cases/1-2.md)
- **1.5** đã rà tại `807fcaf`. Test server trên PostgreSQL 18, 7 test client và build đã đạt trên bản ghép với `main`. Thay đổi 1.5 đã có trên `main` tại `cf62dc0` và `7a90974`. [PR #12](https://github.com/laian2006/MediQueue/pull/12) · [Ca thử 1.5](../testing/cases/1-5.md)
- **1.7 và 1.8** đã có trên `main`, gồm migration `004`, nhật ký trong cùng giao dịch và API cấp, xem phiếu. **1.14** đã ghép giao diện người bệnh với các API này. [PR #11](https://github.com/laian2006/MediQueue/pull/11) · [PR #14](https://github.com/laian2006/MediQueue/pull/14)
- **1.10 và 1.11:** #13 đã bổ sung quy tắc FIFO và API gọi số. Khi chạy toàn bộ test, ca mất kết nối DB cần cập nhật mock `offlinePool` để có `query()` và `connect()`. Bản thử với sửa này đạt 196/196 test trên PostgreSQL 18.6. Hoàng Anh cần đưa sửa vào nhánh, cập nhật router theo `main` đã có API hủy và điền thông tin lần chạy vào báo cáo trước khi duyệt lại. Trung cần 1.11 để ghép **1.17**. [Review #13](https://github.com/laian2006/MediQueue/pull/13#pullrequestreview-5902611169)
- **1.19** đã có trên `main`. Với **1.20**, An đã duyệt tiêu chí PLAT-01 đến PLAT-05 trên #9. Nhánh bảng công khai đã có bản tích hợp thử với API gọi số. Trực cần cập nhật theo `main` sau khi #13 merge và chạy lại ca lấy số → gọi số → `/board` với API thật, không bỏ qua. Trung review và đối chiếu số đang gọi, hàng chờ với **1.17**. [Review #9](https://github.com/laian2006/MediQueue/pull/9#pullrequestreview-5902613547)

- **1.6:** An duyệt các tiêu chí AUTH-01 đến AUTH-05. Tài liệu và bằng chứng tích hợp đã merge qua [PR #17](https://github.com/laian2006/MediQueue/pull/17). Review chéo và hoạt động Sprint ghi theo thực tế.
- **Kiểm tra trên `main` (`4f21920`, 14/11):** 144 test server đạt trên PostgreSQL 18.6, 7 test client đạt và build thành công. Commit này có thêm API hủy phiếu **2.13** qua [PR #15](https://github.com/laian2006/MediQueue/pull/15), thuộc Sprint 2.

## Kịch bản buổi review

1. Ghi commit dùng để demo. Khởi động một PostgreSQL thử, chạy migration và seed theo README, rồi chạy API và giao diện.
2. Đăng nhập bằng STAFF, mở phiên trên `/staff` và đối chiếu trạng thái OPEN. Đăng nhập bằng tài khoản đại diện ở cửa sổ riêng, xác nhận không thể mở phiên.
3. Khi 1.8 và 1.14 đã ghép, đăng nhập tài khoản đại diện, chọn hồ sơ được phép, lấy số và tải lại để xem cùng phiếu.
4. Khi 1.11, 1.17 và 1.20 đã ghép, gọi số từ quầy, đối chiếu lượt gọi trên bảng công khai và kiểm tra JSON không có danh tính người bệnh.
5. Ghi kết quả từng bước và việc chuyển tiếp cùng người phụ trách. Bước còn phụ thuộc hoặc dùng mock cần được ghi rõ trong kết quả review.

## Chuẩn bị retrospective

- Xem lại tác động của thời điểm ghép 1.19 tới các task cần transaction, auth và khung chạy.
- Rà các xung đột lặp lại tại `server/src/app/routes.js`. Chốt thứ tự ghép và người chạy kiểm thử trên `main` sau mỗi lượt.
- Sau buổi họp, ghi ngày họp, người tham dự, kết quả demo, quyết định của nhóm và link bằng chứng. An bổ sung giờ thực tế theo phần đã làm.
