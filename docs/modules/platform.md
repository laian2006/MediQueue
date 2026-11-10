# Mô đun khung, nhật ký và bảng công khai

Chủ trì: Phan Trung Trực. WBS Sprint 1: 1.19, 1.20, tài liệu/review 1.21. Yêu cầu: [user stories và AC](../requirements/platform.md). Thiết kế nền: [system](../architecture/system.md), [ERD](../architecture/erd.md), [OpenAPI](../api/openapi.yaml).

## Phiên bản và trạng thái bàn giao

Ngày 05/11/2026, main ở `de3c072` chưa ghép các thay đổi khung/bảng. Tài liệu 1.21 được tạo độc lập từ main, mô tả các nhánh bàn giao sau để tránh ghi rằng chức năng đã ở main:

| Phần | Nhánh/commit | Kiểm tra | Chờ |
| --- | --- | --- | --- |
| Khung và helper | [task/1.19 — 46512c4](https://github.com/laian2006/MediQueue/commit/46512c47ea28dd64223a524bb2d5155749b16c41) | 78 server + 3 client đạt; build và trình duyệt đạt | Trung review, An merge; Ticket/Event DB test sau 1.7 |
| Bảng công khai | [task/1.20 — 42f2f8e](https://github.com/laian2006/MediQueue/commit/42f2f8e) | 88 server + 7 client đạt; build, polling/lỗi/phục hồi trên trình duyệt đạt | API 1.8/1.11, schema Ticket và đối chiếu với console thật |
| Yêu cầu/tài liệu/review | task/1.21 | Tài liệu này, yêu cầu, review kỹ thuật, kế hoạch demo/retro | An duyệt AC, review nhóm và sự kiện thật |

1.20 kế thừa khung 1.19 chưa merge. Ghép 1.19 trước khi review phần chênh riêng 1.20. Không tự merge main thay An và không đóng task thay reviewer.

## Khung và cấu hình

- `client/src/app/`: main.jsx, App.jsx, routes.jsx; React Router ghép các feature vào một app.
- `client/src/shared/api/http.js`: http.get/post, cookie credentials:include, JSON, AbortSignal, giữ envelope `{data}`, ApiError có status/code/details.
- `server/src/app/`: app.js tạo app, routes.js ghép router, server.js khởi động/đóng kết nối.
- `server/src/shared/config/env.js`: DATABASE_URL, SESSION_SECRET >=32 ký tự, CLIENT_ORIGIN, PORT, COOKIE_SECURE và NO_SHOW_TIMEOUT_SECONDS=60.
- `server/src/shared/db/`: pool.js, transaction.js, migrations.js. Script DB ở server/scripts/database.js.
- Thứ tự app: no-store → Origin/CORS → JSON parser → PostgreSQL auth session middleware → routes → lỗi chung. Không tin actor từ body/query/header.
- Auth store dùng connect-pg-simple, auth_sessions tạo khi dùng phiên; đóng store khi dừng app. Cookie HttpOnly/SameSite=Lax, thời hạn tuyệt đối 8 giờ do Hưng triển khai.

Node >=22.12 (khuyến nghị 24), npm và PostgreSQL 18. Cài/chạy bằng [README tại bản khung](https://github.com/laian2006/MediQueue/blob/46512c4/README.md): tạo DB phát triển riêng → server/.env với secret tự sinh → npm ci trong từng package → server db:migrate/db:seed → server dev → client dev. API 3000, UI 5173; dùng localhost nhất quán. Đổi cổng thì đổi cùng origin/proxy. Không commit .env/node_modules/dist hoặc bí mật VITE_*.

## Giao dịch và nhật ký

`withTransaction(pool, operation)` truyền một client đã BEGIN vào operation, commit nếu thành công, rollback nếu lỗi, luôn release. Các service khóa QueueSession trước Ticket rồi dùng chính client cho mọi query và `appendTicketEvent(client, event)`. Không dùng pool.query bên trong callback để thay client.

Helper nằm `server/src/modules/audit/append-ticket-event.js`, nhận ticketId/actorUserId/action/fromStatus/toStatus; DB tạo event_id/occurred_at. Helper không tự BEGIN/COMMIT, không tạo kết nối và không nuốt lỗi. Service chủ nghiệp vụ kiểm tra quyền/trạng thái, helper không viết lại FIFO.

[Thiết kế TicketEvent và DDL 004 bàn giao](https://github.com/laian2006/MediQueue/blob/46512c4/docs/architecture/ticket-event.md) phải ghép sau 003 của Đức Anh. 1.19 dùng test double cho helper theo kế hoạch; cần test nguyên tử Ticket/Event thật ở 1.7. Bảng kỹ thuật auth_sessions không chiếm số 003/004.

## API và màn hình công khai

`GET /api/v1/public/board`, không cần cookie. Ví dụ trường được phép:

```json
{"data":{"currentTicket":{"number":12,"status":"CALLED"},"waitingNumbers":[13,14,17],"updatedAt":"2026-11-05T12:00:00.000Z"}}
```

Không có phiên OPEN/STOPPED: currentTicket=null và waitingNumbers=[]. Phiếu cuối và phiên CLOSED bị loại; REGISTERING vẫn là số hiện tại. SQL đọc hai danh sách trong cùng một statement snapshot, không trộn hai lần truy vấn. DTO ở cả hai cấp chỉ lấy trường cho phép. Không có tên, mã hồ sơ, UUID/ID nội bộ hoặc dữ liệu sức khỏe. Phản hồi no-store, lỗi 500 chung theo OpenAPI; không che thiếu schema bằng dữ liệu rỗng.

Các tệp `server/src/modules/public-board/public-board.{routes,service,repository,dto}.js` tách endpoint, điều phối, SQL và allowlist. Client `features/public-board/` gồm PublicBoardPage.jsx, public-board.api.js, public-board.polling.js và CSS. Route `/board` đọc API thật qua http.js; không dùng mock patient.

Polling tải ngay và đợi 3 giây sau khi xong mới tải tiếp. Cleanup hủy request/bỏ phản hồi muộn. Lỗi có cảnh báo, giữ snapshot gần nhất nhưng ghi rõ có thể đã cũ; tự phục hồi khi API trở lại. UI chỉ hiển thị, không cấp số/đổi trạng thái. `/patient-demo` vẫn là mock riêng của Đạt.

## Phụ thuộc và bằng chứng

- 1.7/1.8 cung cấp Ticket và cấp/đọc phiếu; 1.11 cung cấp gọi số; 1.20 cần cả hai để nghiệm thu toàn luồng. Main hiện chưa có API 1.8/1.11.
- Test 1.20 dùng PostgreSQL thật nhưng khi chưa có 003 thì dùng fixture test-only sao từ 003 ở `task/1.7@3d570ca`. Không cài fixture vào DB dùng chung, không đưa vào thư mục migrations. Khi 003 thật có, test dùng migration thật.
- Server: TEST_DATABASE_URL của DB test riêng rồi npm test; thiếu URL ghi SKIP. Client: npm test và npm run build. Không thêm framework/lockfile thứ hai.
- [Kết quả 1.19](https://github.com/laian2006/MediQueue/blob/46512c4/docs/testing/cases/1-19.md), [kết quả 1.20](https://github.com/laian2006/MediQueue/blob/42f2f8e/docs/testing/cases/1-20.md), [review phần An](../testing/reviews/1-21-sessions.md), [checklist Sprint 1](../sprints/sprint-1-platform.md).
- Chưa có bằng chứng lấy/gọi phiếu qua API thật và bảng quầy của Trung, chưa có kết quả tải/p95, chưa có sự kiện review/retro thật. Không ghi đã đạt thay cho việc đo/duyệt.
