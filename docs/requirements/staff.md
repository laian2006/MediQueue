# Yêu cầu mô đun vận hành quầy

WBS: 1.18. Chủ trì: Trần Quang Trung (TV5). Reviewer: Đặng Thành Đạt.

Trạng thái: bản nháp để An duyệt user stories/AC. Chưa có xác nhận duyệt,
chưa đủ điều kiện đóng task 1.18. Đây là phần phân tích đầu Sprint 1, không
thay thế review chéo, kiểm tra tích hợp hoặc sự kiện sprint.

## Căn cứ và phạm vi

- `docs/architecture/shared-design-v1.0.md`, `docs/architecture/ticket-state-machine.md`
  và `docs/api/openapi.yaml`.
- Sprint Plan VI, task 1.16, 1.17, 1.18 và hướng dẫn TV5.
- Một quầy, một hàng thông thường, tài khoản và hồ sơ giả lập.
- Trung làm màn hình `/staff`; Hoàng Anh làm API quầy; An làm API phiên và
  SessionPanel; Hưng làm đăng nhập và quyền.
- Task 1.16 dùng mock; task 1.17 nối API thật và PostgreSQL.
- Gọi lại, bắt đầu, hoàn tất, ghi vắng và xung đột đầy đủ thuộc Sprint 2.

## User stories và tiêu chí chấp nhận

### STA-01 Phân biệt lượt hiện tại và hàng chờ

Là nhân viên quầy, tôi muốn thấy tách biệt lượt đang xử lý và các số đang chờ
để không nhầm người cần tiếp nhận.

- Lượt hiện tại dùng `GET /queue/current?sessionId=...`: `ticket` là Ticket hoặc
  null, kèm `noShowTimeoutSeconds` và `serverTime`.
- Hàng chờ dùng `GET /queue/waiting?sessionId=...`: `tickets` là các Ticket
  WAITING theo `number` tăng; UI giữ nguyên thứ tự máy chủ trả về.
- CALLED và REGISTERING có nhãn chữ khác nhau, không chỉ dựa vào màu.
- Ticket đang được gọi không xuất hiện trong danh sách chờ.
- Hiển thị rõ quầy rảnh hoặc quầy bận; CALLED hoặc REGISTERING là quầy bận.
- Không có lượt thì ghi rõ, không hiển thị một số mặc định.
- Hàng rỗng thì có thông báo, không hiển thị số giả.

### STA-02 Gọi tiếp khi quầy rảnh

Là nhân viên quầy, tôi muốn gọi phiếu tiếp theo khi quầy rảnh để người bệnh
được tiếp nhận đúng thứ tự.

- `POST /queue/call-next` gửi `sessionId`; máy chủ chọn phiếu, UI không tự chọn
  và không tự tăng số.
- Nút chỉ khả dụng khi có phiên OPEN/STOPPED, quầy rảnh, hàng có phiếu, dữ liệu
  tải thành công và không có yêu cầu đang gửi. Khi nút bị khóa, lý do được ghi
  bằng chữ.
- Phiên STOPPED không cấp số mới nhưng vẫn gọi được phiếu cũ.
- Chỉ báo thành công sau khi API xác nhận; số hiển thị lấy từ phản hồi.
- Sau thao tác, kể cả thất bại, đọc lại lượt hiện tại và hàng chờ từ máy chủ.
- Bấm lặp khi đang gửi chỉ tạo một yêu cầu.

### STA-03 Xử lý từ chối, xung đột và lỗi tải

Là nhân viên quầy, tôi muốn biết thao tác bị từ chối vì sao và nhìn thấy trạng
thái thật để không làm lệch quầy khi mở hai cửa sổ.

- `409 COUNTER_BUSY`: báo quầy đang có lượt khác rồi tải lại.
- `409 QUEUE_EMPTY`: báo hàng chờ đã hết rồi tải lại.
- `409 INVALID_STATE`: báo trạng thái đã đổi rồi tải lại.
- Lỗi mạng hoặc không nhận được phản hồi: báo chưa có xác nhận, không kết luận
  là đã gọi hoặc chưa gọi; đọc lại trạng thái từ máy chủ.
- Thông báo từ chối vẫn hiển thị sau khi tải lại; UI không tự sửa trạng thái để
  che lỗi.
- Tải lần đầu thất bại: báo lỗi và có nút tải lại, không hiển thị số.
- Tải lại thất bại khi đã có dữ liệu: giữ dữ liệu cũ, cảnh báo có thể đã cũ kèm
  thời điểm cập nhật gần nhất, khóa gọi tiếp đến khi tải lại được.

### STA-04 Xem và điều khiển phiên trên cùng màn hình

Là nhân viên quầy, tôi muốn thao tác phiên ngay trên màn hình quầy để không phải
chuyển trang.

- Khu vực phiên là SessionPanel của An (1.2) được import vào StaffPage. Trung
  không viết lại API hoặc logic mở/ngừng/đóng phiên.
- StaffPage đọc `GET /sessions/current` chỉ để lấy `sessionId` và trạng thái;
  `data=null` nghĩa là chưa có phiên.
- Chưa có phiên thì không đọc hàng chờ và không cho gọi tiếp.
- Khi SessionPanel chưa bàn giao, bản 1.16 chỉ hiển thị trạng thái chỉ đọc từ
  mock, không có nút phiên giả.

### STA-05 Chỉ nhân viên được vận hành quầy (1.17)

Là nhóm phát triển, chúng tôi cần tài khoản thường không vận hành được quầy, kể
cả khi mở URL trực tiếp.

- Mọi API quầy chỉ cho STAFF; máy chủ là nơi quyết định, ẩn nút không thay được
  kiểm tra quyền.
- `401` hoặc `403` không hiển thị dữ liệu quầy; cách điều hướng thống nhất với
  Hưng để các trang xử lý giống nhau. Theo 1.4 (`docs/modules/auth.md`, đã
  merge): `requireStaff` đặt sau `authenticate`; chưa đăng nhập hoặc hết hạn
  tuyệt đối 8 giờ trả 401 `UNAUTHENTICATED`, REPRESENTATIVE trả 403
  `FORBIDDEN`, envelope `{error: {code, message}}`. Tài khoản thử: `staff_01`,
  `rep_a`. UI 1.16 đã có thông báo riêng cho hai mã này (UI-24 đến UI-26, mock);
  chuyển sang LoginPage chờ 1.5 và route 1.19.
- Mock ở 1.16 không chứng minh được quyền; ca này chỉ nghiệm thu ở 1.17.

## Ca từ chối cần kiểm thử

Các ca "1.17 thật" đã chạy bằng `tests/e2e/staff-flow.spec.js` trên Express và
PostgreSQL; số ca E2E ở cột cuối theo `docs/testing/cases/1-17.md`.

| Tình huống | Dữ liệu đầu | Kết quả mong đợi | Task |
| --- | --- | --- | --- |
| Quầy bận, thử gọi tiếp | Có CALLED hoặc REGISTERING | Nút khóa, ghi rõ lý do | 1.16 |
| Hàng rỗng | Quầy rảnh, không có WAITING | Nút khóa, không có số giả | 1.16 |
| Chưa có phiên | `data=null` | Không gọi API hàng chờ, nút khóa | 1.16 |
| Cửa sổ khác vừa gọi | UI thấy quầy rảnh, API trả COUNTER_BUSY | Báo từ chối, tải lại thấy lượt thật | 1.16 mock; 1.17 thật (E2E-8) |
| Phiếu cuối vừa bị hủy | UI thấy còn phiếu, API trả QUEUE_EMPTY | Báo từ chối, tải lại thấy hàng rỗng | 1.16 mock; 1.17 thật (E2E-5) |
| Bấm hai lần nhanh | Quầy rảnh, còn phiếu | Một yêu cầu, một thông báo thành công | 1.16 mock; 1.17 thật (E2E-7) |
| Tài khoản thường | REPRESENTATIVE (`rep_a`) mở `/staff` | 403 `FORBIDDEN`, không thấy hàng chờ, không vận hành được quầy | 1.16 mock; 1.17 thật (E2E-9) |
| Hết phiên đăng nhập | Cookie hết hạn khi bấm gọi | 401 `UNAUTHENTICATED`, không báo "chưa có xác nhận", bỏ dữ liệu quầy | 1.16 mock; 1.17 thật (E2E-4) |

## Ranh giới và bàn giao

- 1.16: wireframe, StaffPage và mock tách riêng, chỗ ghép SessionPanel, bằng
  chứng UI. Ghi rõ là mock.
- 1.17: `staff.api.js` nối API 1.11 qua `http.js`, quyền 1.4, E2E
  `tests/e2e/staff-flow.spec.js`; xác minh Ticket đổi CALLED trong PostgreSQL.
- 2.16: gọi lại, bắt đầu, hoàn tất. 2.17: ghi vắng, thời gian T, xung đột hai
  cửa sổ đầy đủ.
- Không sửa auth, FIFO, API phiên, routes chung hoặc khung app thay chủ mô đun.

## Câu hỏi cần chốt

Đã chốt: An trả lời cả bốn câu ở `docs/design/staff/design-decisions.md`
(mục 1–4). Màn hình quầy chỉ hiện số theo `TicketView` v1.0; SessionPanel gọi
`onSessionChange()`; polling 3 giây, bỏ lượt khi lần trước chưa xong; lỗi đọc từ
`ApiError` của `http.js`. Task 1.17 đã triển khai theo các quyết định này
(`docs/testing/cases/1-17.md`). Nội dung gốc giữ lại bên dưới để đối chiếu.

Theo mẫu Tên — WBS — vấn đề — ảnh hưởng — phương án xử lý.

1. **Trung — 1.16 — Ticket không có tên/mã hồ sơ.** DTO v1.0 chỉ có `patientId`,
   nên quầy chỉ biết số thứ tự, không biết đang tiếp nhận ai. Phương án: Sprint 1
   giữ đúng hợp đồng, chỉ hiển thị số và không hiện UUID. Nếu nhân viên cần tên
   hoặc mã, An quyết định có đổi hợp đồng không.
2. **Trung — 1.16 — Giao diện SessionPanel chưa chốt.** StaffPage cần biết khi
   phiên đổi để đọc lại hàng chờ. Phương án: An cung cấp prop
   `onSessionChange`; StaffPage gọi tải lại trong callback này.
3. **Trung — 1.17 — Polling màn hình quầy.** Thiết kế chung nói client đọc mỗi
   3 giây ở màn hình cần cập nhật nhưng WBS của Trung không ghi rõ. Nếu không có,
   nhân viên không thấy phiếu mới cho đến khi tự tải lại. Phương án: thêm polling
   3 giây ở 1.17; An xác nhận.
4. **Trung — 1.17 — Dạng lỗi của `http.js`.** UI cần đọc `error.code` và
   `details`. Phương án: Trực giữ nguyên `code`, `message`, `details` từ envelope
   lỗi trên đối tượng lỗi ném ra; mock 1.16 đang giả định dạng này.

## Phần còn lại của task 1.18

- An duyệt user stories/AC (bốn câu hỏi trên đã được trả lời).
- Cập nhật tài liệu mô đun theo phần đã tích hợp.
- Trung review task 1.19 và 1.20 của Trực; xử lý review phần mình.
- Kiểm tra tích hợp, planning, review và retrospective có bằng chứng.
- Chưa ghi giờ thực tế; 8 giờ trong kế hoạch là ước lượng.
