# Backend Express

Khung task 1.19 đã ghép auth 1.4 và sessions 1.1. Cài/chạy, cấu hình DB và test theo [README gốc](../README.md#cài-và-chạy--task-119). Dùng npm và package-lock.json; `npm ci`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`.

- app/: app.js tạo ứng dụng, server.js khởi động, routes.js ghép API. Chủ API phối hợp Trực đăng ký route.
- shared/config/env.js: đọc và kiểm tra cấu hình; T ghi vắng được nhóm chốt.
- shared/db/: pool.js và transaction.js dùng chung.
- shared/middleware/: Hưng chủ trì authenticate.js, require-staff.js; lỗi thống nhất theo hợp đồng.
- modules/auth và patients: Hưng.
- modules/sessions: An.
- modules/tickets: Đức Anh làm cấp/đọc/requestId, Đạt làm ticket-cancel.service.js.
- modules/queue: Hoàng Anh làm FIFO và tiếp nhận.
- modules/audit: Trực làm append-ticket-event.js, nhận giao dịch từ nghiệp vụ, không tự commit.
- modules/public-board: Trực trả phản hồi riêng chỉ gồm trường được phép.

routes nhận/kiểm tra đầu vào, service giữ quy tắc nghiệp vụ, repository truy vấn. Test nhỏ đặt __tests__ cạnh module; API/DB/đồng thời đặt tests/integration.

Các thao tác cạnh tranh thống nhất khóa QueueSession trước Ticket, thay đổi phiếu và sự kiện cùng giao dịch. Không tự viết lại quyền hoặc bộ quy tắc trạng thái trong mô đun khác.

## Mô đun phiên task 1.1

An đã triển khai `modules/sessions` và migration 002. Xem [cách ghép router/pool/quyền](../docs/modules/sessions.md). `app/routes.js` dùng middleware xác thực thật của Hưng với pool chung; `app/app.js` đăng ký kiểm tra Origin, JSON, PostgreSQL auth store, routes và error handler theo thứ tự. `GET /api/v1/health` trả 200 khi truy vấn DB được, 503 nếu mất kết nối. Đây là API kiểm tra hạ tầng, không thay đổi hợp đồng nghiệp vụ trong OpenAPI.

## Giao dịch và cấu hình

`createPool(config)` ở `shared/db/pool.js` nhận `databaseUrl`. `loadEnv()` kiểm tra DATABASE_URL, SESSION_SECRET, CLIENT_ORIGIN, PORT và T. Không đọc bí mật từ client. Các route sau có thể lấy T qua `req.app.locals.noShowTimeoutSeconds`.

```js
import { withTransaction } from './src/shared/db/transaction.js';
import { appendTicketEvent } from './src/modules/audit/append-ticket-event.js';

await withTransaction(pool, async (transaction) => {
  // Khóa QueueSession trước Ticket, kiểm tra quyền/trạng thái trong service của chủ mô đun.
  // Cập nhật Ticket qua transaction.query(...), rồi appendTicketEvent(transaction, event).
  // Cả hai cùng commit hoặc rollback; không dùng pool.query trong callback này.
});
```

Các tác vụ quản lý DB dùng một kết nối và advisory lock, lịch sử schema_migrations có checksum. Seed giả lập có thể chạy lại; không có chức năng reset. Store xác thực dùng `createTableIfMissing`, không chiếm số migration 003/004. Factory session expose `.store` để app đóng store khi dừng; `schemaName` tùy chọn chỉ phục vụ schema test. Lỗi gửi client là JSON chung, không có SQL, stack hoặc thông tin kết nối.

Node `node:test` là công cụ unit/API/DB test của khung. `npm test` chạy các test hiện có, tích hợp chỉ chạy khi có TEST_DATABASE_URL. Mô đun Ticket chưa có ở main tại thời điểm 1.19: helper được thử bằng test double; test nguyên tử Ticket/TicketEvent trên DB thật thuộc 1.7.
