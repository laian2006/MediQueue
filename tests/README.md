# Kiểm thử xuyên mô đun

`e2e/` chứa kiểm thử trình duyệt cho luồng người bệnh, quầy, phiên và bảng công khai. Unit/component test nằm cạnh phần được thử; API/DB test nằm trong `server/tests/integration/`.

Để chạy ca 1.20, khởi động client và API theo [README](../README.md) với DB PostgreSQL thử mới đã migrate/seed, chưa mở phiên và chưa có phiếu. Cài Playwright vào môi trường thử có thể được Node phân giải (ví dụ qua `NODE_PATH`). Dùng Chromium của Playwright hoặc trỏ `MEDIQUEUE_E2E_CHROMIUM` đến trình duyệt Chromium có sẵn.

```powershell
$env:MEDIQUEUE_E2E_URL = 'http://localhost:5173'
node --test tests/e2e/public-board-flow.spec.js
```

Mỗi lần chạy E2E cần DB thử riêng vì ca thử mở phiên, cấp phiếu và gọi số thật.
