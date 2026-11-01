# Hợp đồng API

An điều phối docs/api/openapi.yaml khi API v1 được chốt đầu sprint 1. Mỗi chủ API viết phần mình; bên UI/API nhận dữ liệu phải xác nhận dùng được.

Ghi phương thức/đường dẫn, quyền, đầu vào/đầu ra, trường bắt buộc, trạng thái và lỗi. Chốt ý nghĩa patientId/sessionId/ticketId, requestId, thời điểm và đơn vị T. Người đại diện khác tài khoản nhưng có thể dùng chung patientId.

Khi đổi hợp đồng, báo bên nhận, cập nhật tài liệu và test cùng PR. Không tạo nhiều API contract khác nhau theo thành viên. Thư mục chưa có API giả; openapi.yaml chỉ tạo khi có nội dung đã thống nhất.
