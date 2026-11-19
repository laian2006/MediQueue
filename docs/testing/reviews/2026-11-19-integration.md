# Kiểm tra tích hợp ngày 19/11/2026

An rà soát bảng công khai 1.20 và phân quyền 2.4 trên nền `main@70dfca1`. Dùng Node.js 24, PostgreSQL 18 và Playwright Chromium. Mỗi suite integration tạo schema riêng; từng bộ E2E dùng database mới đã chạy migration và seed.

## Review và quyết định

- [PR #9](https://github.com/laian2006/MediQueue/pull/9), đầu nhánh `6aa81db`. An chạy độc lập backend 231/231, frontend 13/13, build và E2E 1/1. Lấy hai số từ `/patient`, bấm gọi ở `/staff`, `/board` ẩn danh hiện cùng số đang gọi 1 và còn chờ số 2. JSON được so sánh toàn bộ với allowlist trong hợp đồng. Duyệt và merge tại `56a946a`.
- [PR #20](https://github.com/laian2006/MediQueue/pull/20), đầu nhánh `b24919f`. Duyệt sau kiểm tra bản ghép cùng #9; merge tại `021e80b`. An chốt giữ hợp đồng 404 cho phiếu không tồn tại, 403 cho hồ sơ ngoài quyền. Xác thực/vai trò đi trước handler và PatientAccess đi trước phản hồi dữ liệu phiếu.
- Mã sửa tích hợp `1787920` giới hạn tối đa bốn tệp test backend đồng thời, sửa fixture kiểm tra thiếu middleware/dịch vụ trong router và diễn giải lại bằng chứng AZ-11.

## Kết quả bản ghép

- Backend **248/248**, lỗi 0, bỏ qua 0 qua `npm test -- --test-reporter=spec`. [Log](../evidence/2-3-2026-11-19/backend.txt)
- Frontend **13/13**, build thành công. PR #20 chỉ đổi server và tài liệu, frontend giữ mã đã kiểm tra trong #9. [Test](../evidence/2-3-2026-11-19/frontend.txt), [build](../evidence/2-3-2026-11-19/build.txt)
- E2E bảng công khai **1/1**, quầy **12/12**, phiên **7/7**, người bệnh **5/5** trên bản ghép quyền mới. Các bộ đều không có ca bị bỏ qua. [Bảng](../evidence/2-3-2026-11-19/board-e2e.txt), [quầy](../evidence/2-3-2026-11-19/staff-e2e.txt), [phiên](../evidence/2-3-2026-11-19/session-e2e.txt), [người bệnh](../evidence/2-3-2026-11-19/patient-e2e.txt)
- Các fixture khởi tạo router được kiểm tra riêng sau chỉnh sửa. Router hồ sơ đạt 4/4; ca thiếu dependency router phiếu đạt 1/1. Các assert xác định đúng middleware hoặc dịch vụ bị thiếu.

## Lỗi môi trường đã xử lý

Lần đầu ghép toàn bộ suite, Node chạy nhiều tệp test song song làm tổng pool vượt `max_connections` của PostgreSQL thử. Nhật ký DB báo `sorry, too many clients already`, mã 53300; một số API trả 500 và ca cạnh tranh thất bại. Script test backend được đổi thành `node --env-file-if-exists=.env --test --test-concurrency=4`. Chạy lại qua npm đạt toàn bộ 248 test. Các lời gọi đồng thời trong từng ca thử vẫn giữ nguyên.

## Phạm vi tiếp tục bàn giao

- Cổng quyền toàn router `/queue` đã có. Handler gọi lại/bắt đầu/hoàn tất/ghi vắng vẫn chờ 2.10/2.11; AZ-11 xác nhận 401/403 ở cổng quyền khi gọi đường dẫn, chưa chứng minh các nghiệp vụ đó đã triển khai.
- Đăng xuất thuộc Hưng 2.5. Nút hủy và cập nhật người bệnh thuộc Đạt 2.14, PR #16 vẫn Draft tại lần kiểm tra.
- Nghiệm thu FF 2.2 còn cần luồng ghi vắng và tiếp nhận đầy đủ. Buổi demo/retro, giờ thực tế và đo tải tiếp tục ghi khi có bằng chứng thực tế.
