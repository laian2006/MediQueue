# Mô đun khung, nhật ký và bảng công khai

Chủ trì: Phan Trung Trực. WBS Sprint 1: 1.19, 1.20, tài liệu/review 1.21. Yêu cầu: [user stories và AC](../requirements/platform.md). Thiết kế nền: [system](../architecture/system.md), [ERD](../architecture/erd.md), [OpenAPI](../api/openapi.yaml).

## Phiên bản và trạng thái bàn giao

Cập nhật 14/11/2026. Khung 1.19 và tài liệu 1.21 đã merge qua PR #8/#10. Bản bàn giao 1.20 tích hợp nền main b8bae9e, giữ login/patient/staff/SessionPanel và API cấp/đọc vé. Bảng công khai ở PR #9, chưa merge.

- Schema 001-004 thật đã có; không còn dùng fixture Ticket sao từ nhánh 1.7.
- 156 test server đạt, 0 lỗi, 1 ca gọi thật chờ 1.11; 11 test client và build đạt.
- Bản ghép thử riêng với PR #13@258fbf1 đạt luồng cấp/gọi số -> bảng; không thay thế nghiệm thu main.
- Chờ 1.11 merge, console 1.17, review/đối chiếu nhóm và kiểm tra sau merge PR #9.

## Khung và cấu hình

- `client/src/app/`: main.jsx, App.jsx, routes.jsx; React Router ghép các feature vào một app.
- `client/src/shared/api/http.js`: http.get/post, cookie credentials:include, JSON, AbortSignal, giữ envelope `{data}`, ApiError có status/code/details.
- `server/src/app/`: app.js tạo app, routes.js ghép router, server.js khởi động/đóng kết nối.
- `server/src/shared/config/env.js`: DATABASE_URL, SESSION_SECRET >=32 ký tự, CLIENT_ORIGIN, PORT, COOKIE_SECURE và NO_SHOW_TIMEOUT_SECONDS=60.
- `server/src/shared/db/`: pool.js, transaction.js, migrations.js. Script DB ở server/scripts/database.js.
- Thứ tự app: no-store → Origin/CORS → JSON parser → PostgreSQL auth session middleware → routes → lỗi chung. Không tin actor từ body/query/header.
- Auth store dùng connect-pg-simple, auth_sessions tạo khi dùng phiên; đóng store khi dừng app. Cookie HttpOnly/SameSite=Lax, thời hạn tuyệt đối 8 giờ do Hưng triển khai.

Node >=22.12 (khuyến nghị 24), npm và PostgreSQL 18. Cài/chạy bằng [README hiện tại](../../README.md): tạo DB phát triển riêng → server/.env với secret tự sinh → npm ci trong từng package → server db:migrate/db:seed → server dev → client dev. API 3000, UI 5173; dùng localhost nhất quán. Đổi cổng thì đổi cùng origin/proxy. Không commit .env/node_modules/dist hoặc bí mật VITE_*.

## Giao dịch và nhật ký

`withTransaction(pool, operation)` truyền một client đã BEGIN vào operation, commit nếu thành công, rollback nếu lỗi, luôn release. Các service khóa QueueSession trước Ticket rồi dùng chính client cho mọi query và `appendTicketEvent(client, event)`. Không dùng pool.query bên trong callback để thay client.

Helper nằm `server/src/modules/audit/append-ticket-event.js`, nhận ticketId/actorUserId/action/fromStatus/toStatus; DB tạo event_id/occurred_at. Helper không tự BEGIN/COMMIT, không tạo kết nối và không nuốt lỗi. Service chủ nghiệp vụ kiểm tra quyền/trạng thái, helper không viết lại FIFO.

Migration 003/004 đã có trên main. Helper dùng cùng transaction đã được kiểm tra qua API thật: lỗi INSERT sự kiện rollback vé và bộ đếm; xem [báo cáo 1.20](../testing/cases/1-20.md). Bảng auth_sessions không chiếm số 003/004.

## API và màn hình công khai

`GET /api/v1/public/board`, không cần cookie. Ví dụ trường được phép:

```json
{"data":{"currentTicket":{"number":12,"status":"CALLED"},"waitingNumbers":[13,14,17],"updatedAt":"2026-11-05T12:00:00.000Z"}}
```

Không có phiên OPEN/STOPPED: currentTicket=null và waitingNumbers=[]. Phiếu cuối và phiên CLOSED bị loại; REGISTERING vẫn là số hiện tại. SQL đọc hai danh sách trong cùng một statement snapshot, không trộn hai lần truy vấn. DTO ở cả hai cấp chỉ lấy trường cho phép. Không có tên, mã hồ sơ, UUID/ID nội bộ hoặc dữ liệu sức khỏe. Phản hồi no-store, lỗi 500 chung theo OpenAPI; không che thiếu schema bằng dữ liệu rỗng.

Các tệp `server/src/modules/public-board/public-board.{routes,service,repository,dto}.js` tách endpoint, điều phối, SQL và allowlist. Client `features/public-board/` gồm PublicBoardPage.jsx, public-board.api.js, public-board.polling.js và CSS. Route `/board` đọc API thật qua http.js; không dùng mock patient.

Polling tải ngay và đợi 3 giây sau khi xong mới tải tiếp. Cleanup hủy request/bỏ phản hồi muộn. Lỗi có cảnh báo, giữ snapshot gần nhất nhưng ghi rõ có thể đã cũ; tự phục hồi khi API trở lại. UI chỉ hiển thị, không cấp số/đổi trạng thái. `/patient-demo` vẫn là mock riêng của Đạt.

## Phụ thuộc và bằng chứng

- 1.7/1.8 đã có trên main; 1.11 còn ở PR #13. Console hàng đợi staff vẫn là mock 1.16 chờ 1.17.
- Test 1.20 dùng schema 003 thật. Test public-board-flow cấp vé qua API, kiểm tra bảng, lỗi audit và restart; tự SKIP ca gọi khi queue.routes.js chưa có.
- Dùng DB test riêng cho server npm test; client npm test và npm run build. Không thêm framework/lockfile.
- [Báo cáo 1.20](../testing/cases/1-20.md), [khung 1.19](../testing/cases/1-19.md), [review phần An](../testing/reviews/1-21-sessions.md), [checklist](../sprints/sprint-1-platform.md).
- Chưa có xác nhận reviewer/AC/demo/retro hoặc kết quả tải/p95; không suy ra Done từ kết quả kỹ thuật.
