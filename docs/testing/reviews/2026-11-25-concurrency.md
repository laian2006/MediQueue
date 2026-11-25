# Review đồng thời cấp số và ngừng phiên ngày 25/11/2026

An kiểm tra [PR #26](https://github.com/laian2006/MediQueue/pull/26), WBS 2.8 của Đức Anh, đầu nhánh `e71180ac`, nền main `d1e3210`. Hưng đã approve ngày 24/11 sau khi chạy PostgreSQL 18.6 đạt 309/309. Theo dõi task ở [Issue #27](https://github.com/laian2006/MediQueue/issues/27).

## Đối chiếu mã nguồn

- `ticket-issue.service.js` lấy khóa QueueSession trước khi đọc lại OPEN và phiếu hoạt động, tăng bộ đếm, tạo phiếu và ghi ISSUED trên cùng transaction client.
- `session.service.js` khóa cùng hàng QueueSession để ngừng/đóng; khóa được giữ đến khi transaction kết thúc. Yêu cầu cấp mới lấy khóa sau STOPPED sẽ nhận `INVALID_STATE`. Gửi lại requestId đã lưu vẫn tuân theo 2.7.
- `allocateNumber` dùng `GREATEST(updated_at, statement_timestamp())` để timestamp phiên giữ tính đơn điệu khi các giao dịch chờ khóa. Cách cũ lấy thời điểm bắt đầu giao dịch bằng CURRENT_TIMESTAMP và có thể ghi lùi thời gian.
- Partial unique index vẫn bảo vệ một phiếu hoạt động cho mỗi hồ sơ/phiên. Các bài test xác nhận trạng thái cuối, số phiếu, sự kiện và bộ đếm; phần xác nhận thứ tự khóa dựa thêm vào review mã nguồn.

## Môi trường và kết quả độc lập

Windows, Node.js 26.13.1, PostgreSQL 18.6, database thử mới, `max_connections=100`. Integration suite tự tạo/xóa schema riêng. Mỗi bộ E2E dùng database mới đã migrate và seed.

- `npm test -- --test-reporter=spec` tại server đạt **309/309**, lỗi 0, bỏ qua 0. [Log](../evidence/2-3-2026-11-25/backend.txt)
- Chạy thêm `ticket-concurrency.test.js` hai lần, cả hai đạt **8/8**. C-03a đạt 0/10 được cấp, C-03b đạt 10/10 được cấp trong hai lần này. [Lần 1](../evidence/2-3-2026-11-25/concurrency-1.txt), [lần 2](../evidence/2-3-2026-11-25/concurrency-2.txt)
- Hồi quy người bệnh **5/5**, gồm thử lại sau mất phản hồi và chuyển hồ sơ. [Log](../evidence/2-3-2026-11-25/patient-e2e.txt)
- Luồng giao diện lấy số → gọi số → bảng công khai đạt **1/1**. [Log](../evidence/2-3-2026-11-25/board-e2e.txt)
- Sau merge, An chạy lại backend trên mã `main@733fd1b`, tiếp tục đạt **309/309**, lỗi 0, bỏ qua 0. [Log main](../evidence/2-3-2026-11-25/main-backend.txt)

Lần chạy đầu dùng cluster thử cũ có giới hạn 20 kết nối. Ca giữ 20 request chờ khóa và các kết nối điều khiển vượt giới hạn, PostgreSQL báo 53300 `too many clients`. An chạy lại cluster thử với 100 kết nối theo môi trường tác giả/Hưng, toàn bộ đạt như trên. Đây là cấu hình cluster kiểm thử riêng.

## Quyết định

An approve [review #26](https://github.com/laian2006/MediQueue/pull/26#pullrequestreview-6052513830) và squash merge tại `733fd1b`. Repo ổ D đã nhận main này. Nhật ký và hồ sơ của An cập nhật trên nhánh `task/2.3-r5` để Trực review theo Issue #25.

## Góp ý và phạm vi còn lại

- C-03b có số yêu cầu được cấp trước stop biến thiên theo lịch khóa. Dữ liệu tác giả và Hưng có các lần từ 3 đến 10. Cần diễn giải theo bất biến trạng thái, phiếu, sự kiện và bộ đếm; việc khởi chạy từng nhóm không bảo đảm mọi yêu cầu của nhóm đầu hoàn tất trước nhóm sau.
- Hưng đã kiểm tra PostgreSQL 18.6; An cũng chạy thành công ở phiên này. Phần môi trường chưa xác minh của báo cáo tác giả cần được đọc cùng bằng chứng review bổ sung này.
- Cấp số cạnh tranh trực tiếp với gọi số/hủy phiếu qua API và đo tải lớn chưa được xác minh trong PR #26. Các điểm đó tiếp tục theo kế hoạch kiểm thử tích hợp và Sprint 3.
- Góp ý về timestamp ở thao tác hủy được chuyển cho chủ mô đun khi cập nhật task hủy. Mã thay đổi thực tế của #26 nằm ở timestamp phiên khi cấp số.

Mã/test 2.8 đã tích hợp và được kiểm tra. Giờ thực tế do Đức Anh bổ sung. Hồ sơ họp, review chéo và giờ công của An tiếp tục theo các Issue 2.1–2.3.
