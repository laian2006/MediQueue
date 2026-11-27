# Review giao diện tiếp nhận 2.16 — 27/11/2026

An kiểm tra [PR #34](https://github.com/laian2006/MediQueue/pull/34) của Trung, head `93c3a66c5726299b38b0b8e245d63f8ccf37c231`, nền `main@80f9264`. Đối chiếu WBS 2.16, thiết kế màn hình quầy, API 2.10 và CONTRIBUTING. Đã đọc thay đổi, báo cáo, test và xem ảnh CALLED/REGISTERING. An review/nghiệm thu độc lập theo yêu cầu của leader; không ghi thay Đạt rằng đã review.

## Kết luận

Không thấy lỗi chặn trong phạm vi 2.16. An [Approve](https://github.com/laian2006/MediQueue/pull/34#pullrequestreview-6089480507) và squash merge tại `4b1b2f8a8f7502fc8e93ffd2c0a68bbfed2eeb1a`. Cây tệp main sau merge giống hoàn toàn head đã kiểm thử.

- CALLED có Bắt đầu tiếp nhận/Gọi lại; REGISTERING có Hoàn tất đăng ký. Gọi tiếp bị khóa khi quầy bận; hoàn tất xong mới gọi tiếp.
- API thao tác theo ticketId, gửi POST không body/query qua http.js; giữ mã lỗi. Một cờ đang gửi dùng chung, dữ liệu cũ khóa nút, chỉ báo thành công sau phản hồi, xong tải lại server.
- Giữ SessionPanel/currentSession/onSessionChange; không đổi server, API, schema, package/lockfile hay migration.
- Mã nguồn và tài liệu qua diff-check; whitespace còn trong log nguyên gốc/đầu ra psql không chặn chức năng và được giữ làm bằng chứng.
- Đã bổ sung Refs #30 vào mô tả PR. No-show/T thuộc #31 (2.17), logout/chuyển tài khoản thuộc #29; chưa được coi là hoàn tất qua PR này.

## Kết quả độc lập

Windows, Node.js 26.13.1, PostgreSQL 18.6, Chromium. Cluster thử riêng cổng 55579, max_connections=100; không dùng hoặc reset DB phát triển. Backend dùng DB mới có public rỗng; mỗi bộ E2E dùng DB riêng migrate/seed. Các bộ dưới đây đều lỗi 0 và bỏ qua 0.

- Client: **15/15**, [log](../evidence/2-3-2026-11-27-staff/client-tests.txt).
- Build: đạt, [log](../evidence/2-3-2026-11-27-staff/client-build.txt).
- Backend: **319/319**, [log](../evidence/2-3-2026-11-27-staff/backend.txt).
- Ticket API riêng: **20/20**, gồm API-14, [log](../evidence/2-3-2026-11-27-staff/tickets-api.txt).
- E2E mới staff-lifecycle: **11/11**, [log](../evidence/2-3-2026-11-27-staff/lifecycle-e2e.txt).
- Hồi quy staff: **12/12**, [log](../evidence/2-3-2026-11-27-staff/staff-e2e.txt).
- Hồi quy SessionPanel: **7/7**, [log](../evidence/2-3-2026-11-27-staff/session-e2e.txt).
- Phiên kết hợp tiếp nhận/ghi vắng/hủy: **4/4**, chờ thật 60 giây, [log](../evidence/2-3-2026-11-27-staff/session_queue-e2e.txt).
- Chạy lại E2E staff-lifecycle trên main sau merge: **11/11**, [log](../evidence/2-3-2026-11-27-staff/main-lifecycle-e2e.txt).

E2E lifecycle xác minh gọi lại giữ số/phiếu, bấm đúp chỉ gửi một yêu cầu, chuyển CALLED → REGISTERING → COMPLETED, cửa sổ cũ nhận 409 rồi tải lại, sai vai trò 403, mất kết nối không báo thành công giả và STOPPED vẫn xử lý phiếu cũ. Ca mất phản hồi của bộ mới chặn yêu cầu trước khi đến server; không diễn giải thành bằng chứng mất phản hồi sau commit. Kiểm tra 360px của bộ này ở trạng thái quầy rảnh; chưa chứng minh riêng mọi nhóm nút trên mobile.

## Đối chứng lỗi API-14 tác giả báo

Tác giả giữ log 317/319 trên máy mình. An chạy toàn suite và tệp ticket API trên DB test mới có public rỗng đều đạt. Sau đó tạo một DB đối chứng riêng, migrate/seed bảng trong public rồi chạy lại chính tệp ticket API: tái hiện API-14 trả 404 thay vì 500, **18/20 đạt** (một ca con và ca cha trượt). [Log đối chứng cố ý tái hiện lỗi](../evidence/2-3-2026-11-27-staff/tickets-api-public-control.txt).

Nguyên nhân của ca đối chứng: pool đặt search_path = schema_test,public. API-14 đổi tên tickets trong schema thử để gây lỗi thiếu bảng, nhưng SQL tiếp tục tìm public.tickets; bảng đó không có ticketId thử nên trả 404. Chưa trực tiếp kiểm tra cấu hình DB trên máy Trung, nên chỉ kết luận đã tái hiện đúng triệu chứng trong điều kiện này. Đây là điều kiện/cách cô lập fixture có sẵn, không phải lỗi do thay đổi giao diện 2.16.

Không đổi mong đợi 500 thành 404 để làm xanh test; không xóa/reset DB dùng chung. Trung đối chiếu TEST_DATABASE_URL/public và dùng DB test riêng mới. Nếu cần cải thiện cách cô lập fixture, chủ test phối hợp theo workflow riêng; không sửa nghiệp vụ phiếu thay Đức Anh trong PR UI.

## Bàn giao tiếp

- 2.16 đạt nghiệm thu kỹ thuật trên main ngày 27/11; hạn gốc 20/11 giữ nguyên để phản ánh trễ. Trung bổ sung giờ thực tế tại #30, không ghi đủ 6 giờ theo ước lượng.
- Trung làm 2.17 từ main mới, nhánh đã giao task/2.17, Refs #31. Không push tiếp nhánh 2.16 đã merge; phần thời gian/ghi vắng và xung đột đầy đủ còn chờ.
- Trực dùng main có 2.16 để tiếp tục đầu ra 2.20 theo #33; 2.19 theo #32 vẫn cần bằng chứng riêng.
- PR #16 vẫn Draft; không thay trạng thái hoặc merge. Review phần An qua #23/#24/#25, giờ thực tế và hoạt động sprint tiếp tục ghi theo bằng chứng.
