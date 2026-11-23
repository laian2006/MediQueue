# Tên nhánh cố định cho MediQueue

Áp dụng từ 02/11/2026. Mã WBS lấy từ Excel; số Issue GitHub là định danh khác. Quy định này thay các ví dụ tên nhánh feat/, fix/ hoặc docs/ trong hướng dẫn cũ.

## Quy định áp dụng

- `main`: bản tích hợp chung; chỉ An merge PR sau review. Đây là quy ước nhóm, chưa phải xác nhận đã bật branch protection.
- Task trong kế hoạch dùng đúng `task/<WBS>`, ví dụ `task/1.1`, `task/1.13`, `task/2.7`. Giữ dấu chấm; không thêm tên người, tên tính năng hoặc thay dấu chấm bằng gạch nối.
- Cùng task dùng cùng nhánh cho code, tài liệu, test và sửa phản hồi trước merge. Chỉ người phụ trách chính push lên nhánh đó; phối hợp sửa qua chủ task.
- Một nhánh chỉ có một PR đang mở. Lấy nhánh từ main mới nhất; không tạo nhánh task từ nhánh của người khác. Người review bình luận/Approve trên PR, không tự tạo nhánh review.
- Task 8 giờ chỉ tạo nhánh khi thực sự sửa tệp. Họp, review và điều phối thuần ghi bằng chứng vào Issue; không tạo nhánh/PR rỗng.
- Sau merge, không push tiếp vào nhánh cũ. Nếu task còn cần PR sửa tệp khác, An giao tên lượt tiếp `task/<WBS>-r2`, rồi `-r3` theo thứ tự; luôn tạo mới từ main. Thành viên không tự tăng lượt.
- Lỗi phát hiện sau merge được An giao Issue lỗi riêng, nhánh `bug/<số Issue thực>`, ví dụ Issue số 85 dùng `bug/85`. Không nhầm số Issue với WBS và không tự đặt tên khác.
- Chỉ xóa nhánh đã merge khi không còn thay đổi chưa bàn giao; không xóa hoặc đổi tên nhánh đang có việc mà chưa báo An. Quy định này không tự tạo, đổi tên hay xóa nhánh Git.

## Danh sách tên nhánh đã giao

Ngày 23/11/2026, An công bố nhánh `task/2.1` và `task/2.2` cho hồ sơ/bằng chứng bàn giao từng task, cùng `task/2.3-r5` cho thiết kế, điều phối và tổng hợp review. Cả ba nhánh lấy từ `main@d1e3210`. Mã chức năng 2.1/2.2 đã tích hợp trước đợt này. Theo chỉ đạo của An, review đợt này qua Issue #23/#24/#25 với commit cụ thể; không mở PR.

### Leader — Lại Quốc Bình An

Sprint 1

- `task/1.1` — Thiết kế phiên và API mở phiên.
- `task/1.2` — Giao diện quản lý phiên cơ bản.
- `task/1.3` — Yêu cầu, kiến trúc và review sprint (chỉ tạo khi sửa tệp).

Sprint 2

- `task/2.1` — Ngừng cấp số và điều kiện đóng phiên.
- `task/2.2` — Hoàn thiện quản lý phiên trên giao diện.
- `task/2.3` — Thiết kế, điều phối và review sprint (chỉ tạo khi sửa tệp).

Sprint 3

- `task/3.1` — Kiểm thử toàn bộ vòng đời phiên.
- `task/3.2` — Sửa lỗi mô đun phiên và chốt bàn giao.
- `task/3.3` — Điều phối, nghiệm thu và chốt bản cuối (chỉ tạo khi sửa tệp).

### TV1 — Lê Gia Hưng

Sprint 1

- `task/1.4` — Dữ liệu tài khoản và kiểm tra quyền nền.
- `task/1.5` — Đăng nhập và danh sách hồ sơ được phép.
- `task/1.6` — Yêu cầu mô đun, tài liệu và review (chỉ tạo khi sửa tệp).

Sprint 2

- `task/2.4` — Áp dụng quyền cho toàn bộ nghiệp vụ.
- `task/2.5` — Kiểm thử quyền với nhiều người đại diện.
- `task/2.6` — Tài liệu, review chéo và sự kiện sprint (chỉ tạo khi sửa tệp).

Sprint 3

- `task/3.4` — Ma trận kiểm thử truy cập trái quyền.
- `task/3.5` — Sửa lỗi quyền và tài khoản phục vụ demo.
- `task/3.6` — Tài liệu, review chéo và sự kiện sprint (chỉ tạo khi sửa tệp).

### TV2 — Lê Đức Anh

Sprint 1

- `task/1.7` — Dữ liệu phiếu và cấp số nền.
- `task/1.8` — API cấp số và xem phiếu riêng.
- `task/1.9` — Yêu cầu mô đun, tài liệu và review (chỉ tạo khi sửa tệp).

Sprint 2

- `task/2.7` — Yêu cầu gửi lại không sinh phiếu mới.
- `task/2.8` — Kiểm tra đồng thời và ngừng nhận số.
- `task/2.9` — Tài liệu, review chéo và sự kiện sprint (chỉ tạo khi sửa tệp).

Sprint 3

- `task/3.7` — Kiểm thử 20 yêu cầu và nhiều người đại diện.
- `task/3.8` — Sửa lỗi cấp số và lưu bền dữ liệu.
- `task/3.9` — Tài liệu, review chéo và sự kiện sprint (chỉ tạo khi sửa tệp).

### TV3 — Hồ Sỹ Hoàng Anh

Sprint 1

- `task/1.10` — Quy tắc trạng thái và gọi FIFO cơ bản.
- `task/1.11` — API gọi lượt tích hợp.
- `task/1.12` — Yêu cầu mô đun, tài liệu và review (chỉ tạo khi sửa tệp).

Sprint 2

- `task/2.10` — Gọi lại và tiếp nhận đến hoàn tất.
- `task/2.11` — Ghi vắng và kiểm tra ranh giới thời gian.
- `task/2.12` — Tài liệu, review chéo và sự kiện sprint (chỉ tạo khi sửa tệp).

Sprint 3

- `task/3.10` — Kiểm thử gọi đồng thời và ngoại lệ.
- `task/3.11` — Sửa lỗi quy tắc và kiểm thử hồi quy.
- `task/3.12` — Tài liệu, review chéo và sự kiện sprint (chỉ tạo khi sửa tệp).

### TV4 — Đặng Thành Đạt

Sprint 1

- `task/1.13` — Thiết kế và dựng giao diện người bệnh.
- `task/1.14` — Kết nối luồng lấy số và xem phiếu.
- `task/1.15` — Yêu cầu mô đun, tài liệu và review (chỉ tạo khi sửa tệp).

Sprint 2

- `task/2.13` — API hủy phiếu và kiểm thử quyền.
- `task/2.14` — Giao diện hủy và cập nhật trạng thái.
- `task/2.15` — Tài liệu, review chéo và sự kiện sprint (chỉ tạo khi sửa tệp).

Sprint 3

- `task/3.13` — Kiểm thử người dùng trên trình duyệt.
- `task/3.14` — Sửa lỗi và hướng dẫn người dùng.
- `task/3.15` — Tài liệu, review chéo và sự kiện sprint (chỉ tạo khi sửa tệp).

### TV5 — Trần Quang Trung

Sprint 1

- `task/1.16` — Thiết kế màn hình vận hành quầy.
- `task/1.17` — Kết nối gọi lượt cơ bản.
- `task/1.18` — Yêu cầu mô đun, tài liệu và review (chỉ tạo khi sửa tệp).

Sprint 2

- `task/2.16` — Giao diện đầy đủ thao tác tiếp nhận.
- `task/2.17` — Giao diện ghi vắng và xử lý xung đột.
- `task/2.18` — Tài liệu, review chéo và sự kiện sprint (chỉ tạo khi sửa tệp).

Sprint 3

- `task/3.16` — Kiểm thử toàn luồng nhân viên.
- `task/3.17` — Sửa lỗi giao diện quầy và tài liệu.
- `task/3.18` — Tài liệu, review chéo và sự kiện sprint (chỉ tạo khi sửa tệp).

### TV6 — Phan Trung Trực

Sprint 1

- `task/1.19` — Khung dự án và hàm nhật ký dùng chung.
- `task/1.20` — Bảng gọi số và API công khai cơ bản.
- `task/1.21` — Yêu cầu mô đun, tài liệu và review (chỉ tạo khi sửa tệp).

Sprint 2

- `task/2.19` — Hoàn thiện nhật ký và bảo vệ dữ liệu công khai.
- `task/2.20` — Kiểm tra tự động và môi trường tích hợp.
- `task/2.21` — Tài liệu, review chéo và sự kiện sprint (chỉ tạo khi sửa tệp).

Sprint 3

- `task/3.19` — Thử tải và đo tốc độ cập nhật.
- `task/3.20` — Kiểm thử tích hợp và đóng gói demo.
- `task/3.21` — Tài liệu, review chéo và sự kiện sprint (chỉ tạo khi sửa tệp).

## Thao tác Git Bash mẫu

Chỉ chạy khi đã xử lý các thay đổi đang làm. Thay `1.1` bằng đúng WBS trên trang task của bạn. Nếu tên nhánh đã tồn tại, dừng và kiểm tra với An, không dùng lệnh ép ghi đè.

```bash
git switch main
git pull --ff-only origin main
git switch -c task/1.1
```

Khi đã tự kiểm tra và chọn đúng tệp:

```bash
git add <các-tệp-của-task>
git commit -m "[1.1] Complete session API"
git push -u origin task/1.1
```

`<các-tệp-của-task>` là chỗ thay bằng đường dẫn thật, không chạy nguyên dòng đó. Tạo PR về main, ghi WBS/Issue/bằng chứng và yêu cầu đúng reviewer. An merge; tác giả kiểm tra lại trên main rồi mới đóng task khi đủ AC.
