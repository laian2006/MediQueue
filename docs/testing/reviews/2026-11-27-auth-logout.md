# Review và tích hợp quyền/đăng xuất — 27/11/2026

An kiểm tra [PR #28](https://github.com/laian2006/MediQueue/pull/28) của Hưng, WBS 2.5, head `adf9033e92e352403e52c04564c0bc3baa003ea3`. Căn cứ: CONTRIBUTING, tên nhánh, thiết kế v1.0, hợp đồng OpenAPI, WBS và hướng dẫn TV1. Đã đọc thay đổi và comment bàn giao của tác giả; không có review hoặc yêu cầu sửa trước đó trên PR.

## Phạm vi và kết luận review

- Thêm `POST /api/v1/auth/logout`, yêu cầu đăng nhập; hủy phiên trong store trước khi trả thành công; xóa cookie `mediqueue.sid`; trả `{data:null}`. Body JSON bị từ chối, phiên hợp lệ còn nguyên. Chỉ hủy phiên hiện tại.
- Ma trận kiểm thử dùng app và cookie thật: hồ sơ chung/riêng, đại diện chưa có hồ sơ, STAFF và người chưa đăng nhập; xem/lấy/hủy; dữ liệu không đổi khi bị từ chối.
- Kiểm tra đăng xuất, cookie cũ, phiên khác, chuyển tài khoản và thời hạn tuyệt đối 8 giờ qua store PostgreSQL thật.
- Không sửa migration, seed, dependency hoặc nghiệp vụ cấp/gọi/hủy của các chủ mô đun khác. Dữ liệu bổ sung chỉ nằm trong schema test tạm; SQL chuẩn bị fixture không được coi là bằng chứng thao tác người dùng.
- Không thấy lỗi chặn trong phạm vi server/bộ kiểm thử được bàn giao. An [Approve](https://github.com/laian2006/MediQueue/pull/28#pullrequestreview-6082281598) và squash merge tại `80f9264ddbb395b51de2de98de9f5bc5b09affb1`.

## Kiểm tra độc lập

Windows, Node.js 26.13.1, PostgreSQL 18.6. Dùng cluster thử riêng, cổng 55579, `max_connections=100`; DB backend mới có public rỗng và quyền tạo schema. DB E2E tách riêng từng bộ, migrate/seed theo repo. Không dùng hoặc reset DB phát triển trên máy An.

Bản ghép head `adf9033` + `main@733fd1b` không conflict, `git diff --check` đạt. Cây tệp đã kiểm thử `3bcca5dc6fad56a25db8ae64b42d300f79bbb9ba` giống hoàn toàn commit merge trên main.

- Backend: **319/319**, lỗi 0, bỏ qua 0. [Log](../evidence/2-3-2026-11-27/backend.txt)
- Bộ 2.5 riêng: **10/10** (9 ca con và ca cha), lỗi 0, bỏ qua 0. [Log](../evidence/2-3-2026-11-27/access.txt)
- E2E người bệnh trên Chromium/API/PostgreSQL thật: **5/5**. [Log](../evidence/2-3-2026-11-27/patient-e2e.txt)
- E2E nhân viên trên Chromium/API/PostgreSQL thật: **12/12**. [Log](../evidence/2-3-2026-11-27/staff-e2e.txt)
- Chạy lại backend trên `main@80f9264` sau merge: **319/319**, lỗi 0, bỏ qua 0. [Log](../evidence/2-3-2026-11-27/main-backend.txt)

Số 311 trong hồ sơ tự kiểm tra của tác giả thuộc nền cũ; main mới có thêm bộ tranh chấp 2.8, nên kết quả bản ghép là 319. Không cộng các lần chạy thành số ca khác nhau. PR không đổi client; các bộ E2E trên kiểm tra hồi quy chức năng đã có, chưa chứng minh UI đăng xuất mới.

## Việc còn lại và giới hạn nghiệm thu

- [Issue #29](https://github.com/laian2006/MediQueue/issues/29) theo dõi task 2.5. Đã thay `Refs #` trống trong mô tả PR bằng `Refs #29`; giữ Issue mở, không dùng Closes.
- Hưng tiếp tục phối hợp Đạt/Trung theo phân công hiện hành: điểm gọi client/nút đăng xuất và loại bỏ dữ liệu riêng khi chuyển tài khoản. Client gọi `http.post('/auth/logout')` không body. Chưa có thay đổi UI trong PR #28.
- SW-01 chứng minh quyền và dữ liệu phiên phía server. Cần kiểm tra DOM, dữ liệu cũ trong tab và chuyển tài khoản trên giao diện thật trước khi chốt toàn bộ AC 2.5. Backend đạt không thay thế bằng chứng này.
- PR #16 của Đạt (2.14) vẫn Draft tại `b00bb25`; giữ nguyên, không tự chuyển Ready hoặc merge.
- Chưa thấy nhánh/PR 2.16/2.17 của Trung trên GitHub tại lần rà soát; không suy ra trạng thái công việc chưa push trên máy cá nhân.
- Review của Trực cho #23/#24/#25, giờ thực tế và hoạt động sprint tiếp tục ghi theo bằng chứng. Không thay đổi lịch/phạm vi hoặc tự đánh dấu Done.
