# Mô đun tickets — Yêu cầu, AC và đề xuất API v1

- **Task:** 1.9 (S1-TV2-C), phần *Requirements 1 h in W10 before coding*
- **Người viết:** Lê Đức Anh (TV2) · **Review:** Lê Gia Hưng (TV1) · **Bên dùng trực tiếp cần góp ý:** An (sessions), Hoàng Anh (TV3), Đạt (TV4), Trực (TV6)
- **Ngày:** 02/11/2026 (W10 D1) · **Trạng thái:** Bản nháp để chốt API ngày D1. Chưa có code, chưa phải kết quả.
- **Căn cứ:** Hướng dẫn triển khai tuần 9–16 (quy tắc nghiệp vụ, dữ liệu, hợp đồng API), Sprint Plan (1.7, 1.8, 2.7, 2.8, 3.7, 3.8), Phân công vai trò (TV2).

## 1. Phạm vi của mô đun

**TV2 chủ trì:** tạo phiếu (cấp số), schema `Ticket`, tra cứu phiếu riêng kèm vị trí chờ, xử lý gửi lại theo `requestId`.

**Không thuộc TV2:** chuyển trạng thái sau WAITING (TV3), hủy phiếu WAITING (TV4), vòng đời phiên (An), đăng nhập/quyền (TV1), ghi `TicketEvent` (TV6 cung cấp helper; TV2 chỉ gọi helper này), bảng công khai (TV6).

| Sprint | Task | Nội dung TV2 giao |
|---|---|---|
| S1 | 1.7 (W10 D3–D5) | Schema Ticket, ràng buộc duy nhất, cấp số trong giao dịch |
| S1 | 1.8 (W11 D1–D2) | `POST /api/tickets`, `GET /api/tickets/:id`, vị trí chờ, gắn quyền và nhật ký |
| S2 | 2.7 / 2.8 | Gửi lại theo requestId (idempotent); cấp số đồng thời, từ chối khi phiên STOPPED |
| S3 | 3.7 / 3.8 | Thử 20 yêu cầu, hai đại diện, gửi lại; khởi động lại API và rollback |

## 2. User story và tiêu chí chấp nhận

### US-T1: Lấy số cho một hồ sơ được phép (Sprint 1, task 1.7/1.8)
*Là người bệnh hoặc người đại diện đã đăng nhập, tôi muốn lấy số cho một hồ sơ mình có quyền để được xếp vào hàng chờ của phiên đang mở.*

- **AC1:** Phiên OPEN và tài khoản có `PatientAccess` với `patientId`: trả **201**. Phiếu ở trạng thái `WAITING` và có `number` lớn hơn mọi số đã cấp trong phiên.
- **AC2:** Server lấy `createdBy` từ phiên đăng nhập. Trường `userId`/`createdBy` gửi từ trình duyệt bị bỏ qua.
- **AC3:** Hồ sơ không thuộc quyền tài khoản: **403**, không tạo phiếu, không tăng bộ đếm.
- **AC4:** Phiên không tồn tại: **404**. Phiên STOPPED hoặc CLOSED: **409**, không tạo phiếu.
- **AC5:** Người bệnh đã có phiếu WAITING/CALLED/REGISTERING trong phiên: **409**, không tạo phiếu thứ hai, kể cả khi yêu cầu đến từ tài khoản đại diện khác.
- **AC6:** Phiếu và sự kiện `ISSUE` (fromStatus null → WAITING) được ghi trong cùng một giao dịch. Nếu giao dịch lỗi thì không còn phiếu, không còn sự kiện và bộ đếm không đổi.
- **AC7:** Chưa đăng nhập: **401**. Thiếu hoặc sai kiểu `sessionId`/`patientId`/`requestId`: **400**.

### US-T2: Lấy số hộ nhiều người bệnh (Sprint 1, kiểm thử T03)
*Là người đại diện có quyền với nhiều hồ sơ, tôi muốn lấy số riêng cho từng người.*

- **AC1:** Một tài khoản lấy số cho hai `patientId` khác nhau trong cùng phiên thì được hai phiếu riêng, số khác nhau, mỗi phiếu gắn đúng `patientId`.
- **AC2:** Quy tắc "một phiếu hoạt động" áp dụng theo `patientId`, không áp dụng theo tài khoản.

### US-T3: Xem phiếu của mình và vị trí chờ (Sprint 1, task 1.8)
*Là người có quyền với hồ sơ, tôi muốn xem phiếu đã lưu, trạng thái và số người đứng trước mình.*

- **AC1:** Người có `PatientAccess` với `patientId` của phiếu, hoặc nhân viên (STAFF): trả **200** với `id, number, status, sessionId, patientId, createdAt` và `lastCalledAt` (nếu đã gọi).
- **AC2:** Khi phiếu đang `WAITING`: `position = 1 + số phiếu WAITING cùng phiên có number nhỏ hơn`. Phiếu CANCELLED/NO_SHOW/COMPLETED và phiếu đang CALLED/REGISTERING không được tính. Khi phiếu ở trạng thái khác: `position = null`.
- **AC3:** Tài khoản không có quyền với hồ sơ: **403**, không trả bất kỳ trường nào của phiếu. Không tồn tại `id`: **404**.
- **AC4:** Mọi thời điểm là ISO 8601 do server sinh.

### US-T4: Gửi lại không sinh phiếu mới (Sprint 2, task 2.7; kiểm thử T05)
*Là người dùng mạng chậm, tôi muốn bấm gửi lại mà không bị cấp thêm số.*

- **AC1:** Khóa gửi lại là `(createdBy, requestId)`. Cùng khóa, cùng `sessionId` và `patientId`: trả lại phiếu cũ (**200**) kể cả khi phiếu đã kết thúc, không tăng bộ đếm, không ghi thêm sự kiện.
- **AC2:** Cùng khóa nhưng khác `sessionId` hoặc `patientId`: **409**.
- **AC3:** Vẫn kiểm tra quyền trước khi trả phiếu cũ.

### US-T5: Cấp số đúng khi có yêu cầu đồng thời (Sprint 2–3, task 2.8/3.7; kiểm thử T02, T04)
- **AC1:** 20 người bệnh gửi đồng thời: 20 phiếu, 20 số khác nhau, tất cả đều có trong PostgreSQL.
- **AC2:** Hai đại diện của cùng một hồ sơ gửi đồng thời: đúng một phiếu hoạt động. Yêu cầu còn lại nhận **409**.
- **AC3:** Sau khi khởi động lại API, số đã cấp không bị dùng lại (T12).

## 3. Đề xuất dữ liệu `Ticket` (để chốt trước khi viết migration ngày D3)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | bigserial / uuid (theo quy ước chung của 1.19) | PK |
| session_id | FK → queue_session(id) | NOT NULL |
| patient_id | FK → patient_profile(id) | NOT NULL |
| number | integer > 0 | NOT NULL |
| status | text CHECK IN (WAITING, CALLED, REGISTERING, COMPLETED, CANCELLED, NO_SHOW) | mặc định WAITING |
| created_by | FK → user(id) | lấy từ phiên đăng nhập |
| request_id | uuid | NOT NULL |
| last_called_at | timestamptz | null; TV3 cập nhật |
| created_at / updated_at | timestamptz | server sinh |

Ràng buộc ở PostgreSQL:
1. `UNIQUE (session_id, number)`: số không trùng trong phiên.
2. Unique index một phần `(session_id, patient_id) WHERE status IN ('WAITING','CALLED','REGISTERING')`: mỗi người bệnh chỉ có một phiếu hoạt động. TV3 và TV4 phải giữ được ràng buộc này sau mọi lần chuyển trạng thái.
3. `UNIQUE (created_by, request_id)`: khóa gửi lại.
4. "Dữ liệu đối chiếu yêu cầu" dùng chính `session_id` và `patient_id` của dòng, nên không cần thêm cột.

Luồng cấp số trong một giao dịch: khóa dòng `QueueSession` bằng `SELECT … FOR UPDATE` (thứ tự khóa: phiên trước, phiếu sau). Kiểm tra `status = OPEN`, kiểm tra quyền, tăng bộ đếm của phiên rồi lấy số, chèn `Ticket`, gọi helper `TicketEvent` của TV6, COMMIT. Nếu vi phạm ràng buộc 2 thì trả 409. Số không bao giờ được tính ở trình duyệt.

## 4. Đề xuất hợp đồng API v1 (phần của TV2)

### `POST /api/tickets`
Request:
```json
{ "sessionId": "<id>", "patientId": "<id>", "requestId": "<uuid v4>" }
```
Response **201** (lần đầu) hoặc **200** (gửi lại, từ Sprint 2):
```json
{
  "id": "<id>", "sessionId": "<id>", "patientId": "<id>",
  "number": 12, "status": "WAITING", "position": 3,
  "lastCalledAt": null, "createdAt": "2026-11-09T08:15:30.000Z"
}
```
Lỗi: 400 · 401 · 403 (không có quyền với hồ sơ) · 404 (phiên không tồn tại) · 409 (phiên không OPEN / đã có phiếu hoạt động / requestId xung đột).

### `GET /api/tickets/:id`
Response **200**: cùng cấu trúc như trên. `position` chỉ có số khi `status = WAITING`, các trường hợp khác là `null`.
Lỗi: 401 · 403 · 404.

Mock cho TV4 và TV5 có thể dựng ngay theo hai ví dụ trên.

## 5. Câu hỏi cần chốt trong buổi D1

1. **Bộ đếm số:** cột counter nằm ở bảng `QueueSession` của An. TV2 được tăng cột này trong giao dịch cấp số không, hay An cung cấp một hàm như `allocateNumber(tx, sessionId)`?
2. **Định dạng lỗi chung:** đề xuất `{ "error": { "code": "SESSION_NOT_OPEN", "message": "..." } }` để phân biệt các loại 409 ở UI. An chốt ở 1.3.
3. **Kiểu id:** dùng uuid hay bigserial, theo quy ước khung của Trực (1.19)?
4. **`requestId` ở Sprint 1:** đề xuất bắt buộc gửi ngay từ S1 và có ràng buộc unique. Ở S1, gửi trùng khóa sẽ trả 409. Logic trả lại phiếu cũ làm ở 2.7.
5. **Ẩn sự tồn tại phiếu:** người ngoài quyền nhận 403 theo hướng dẫn hiện tại. Có cần đổi sang 404 để không lộ việc phiếu tồn tại không?
6. **Tên sự kiện:** dùng `ISSUE` (hoặc tên khác) cho `TicketEvent.action` khi tạo phiếu. Cần thống nhất với Trực.

## 6. Giả định chưa xác minh
- Chưa phỏng vấn người dùng thực. Mọi quy tắc trên lấy từ tài liệu nhóm.
- Vai trò STAFF do TV1 định nghĩa. Mô đun tickets chỉ đọc vai trò qua middleware dùng chung.
