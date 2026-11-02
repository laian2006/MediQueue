## Task

- WBS:
- Nhánh: task/<WBS>; nếu PR tiếp hoặc lỗi sau merge, dùng tên An đã giao theo docs/planning/branch-names.md.
- Issue: Refs #
- Reviewer:

## Thay đổi

- Tệp/module chính và kết quả bàn giao:
- API/schema/tệp chung bị thay đổi; đã báo ai:
- Migration/seed và cách áp dụng nếu có:

## Kiểm tra

- Cách chạy/lệnh đã dùng:
- Dữ liệu, ca thử và kết quả thực tế:
- Link bằng chứng, commit được thử:
- Phần chưa xong/lỗi còn mở:

## Trước merge

- [ ] Đúng phạm vi WBS và hợp đồng đã chốt.
- [ ] Đã tự kiểm tra, ghi rõ ca chưa chạy nếu có.
- [ ] Không có .env, dữ liệu thật, node_modules hoặc build output.
- [ ] Đã báo các bên khi đổi phần dùng chung.

<!-- Dùng số Issue thực. Chỉ thay Refs bằng Closes khi PR hoàn thành trọn Issue đó.
Không đánh dấu mục chưa làm. Reviewer kiểm tra trước khi An merge;
tác giả kiểm tra tích hợp trên main trước khi task được Done. -->
