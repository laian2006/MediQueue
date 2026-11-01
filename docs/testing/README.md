# Ca thử và bằng chứng

Mã task 1.13 dùng cases/1-13.md và evidence/1-13/. Tạo thư mục bằng chứng khi có tệp thật, không cần tạo sẵn 63 bộ tài liệu rỗng.

Mỗi ca ghi: điều kiện/dữ liệu đầu → bước → mong đợi → thực tế → đạt/chưa đạt → commit và link bằng chứng. Ghi rõ thử tay/tự động, mock/API thật; Chưa chạy nếu chưa thực hiện.

Mã test đặt đúng nơi: unit/component cạnh mô đun/feature, API/DB ở server/tests/integration, E2E ở tests/e2e, tải ở tests/load. Ảnh và bằng chứng đã lọc bí mật mới đưa vào evidence. Log tự sinh không commit; trích kết quả đã rà soát vào .md hoặc .txt nếu cần.

Trực tổng hợp load-report.md ở 3.19 và final-report.md ở 3.20, các chủ mô đun cung cấp kết quả của mình. Không chép mục tiêu tải thành kết quả đo đã đạt.
