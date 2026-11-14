# MediQueue · Chốt thiết kế màn hình quầy

## 1. Thông tin phiếu

Màn hình quầy dùng số thứ tự để nhận diện phiếu. Giữ nguyên `TicketView` v1.0. `patientId` dùng nội bộ và không hiển thị. Tên người bệnh và mã hồ sơ nằm ngoài phạm vi Sprint 1.

## 2. Đồng bộ phiên và hàng đợi

Sau khi API xác nhận thao tác đổi trạng thái phiên thành công, `SessionPanel` gọi `onSessionChange()`. `StaffPage` xử lý callback bằng cách tải lại phiên hiện tại và hàng đợi tương ứng.

## 3. Tự cập nhật

Trong task 1.17, màn hình quầy cập nhật dữ liệu mỗi 3 giây khi đang mở. Bỏ qua lượt polling nếu lần tải trước chưa kết thúc. Dừng polling khi rời màn hình.

## 4. Xử lý lỗi API

Task 1.17 dùng `ApiError` từ `client/src/shared/api/http.js` của task 1.19. Dựa vào `code` để chọn cách xử lý, dùng `message` để đưa ra thông báo phù hợp và đọc `details` khi cần thông tin bổ sung.

## Phạm vi bàn giao

PR #7 cập nhật tài liệu yêu cầu `docs/requirements/staff.md` theo bốn quyết định trên và đổi tham chiếu kế hoạch sang **Sprint Plan EN** (`../planning/MediQueue_Group11_Sprint_Plan.xlsx`). Phần tích hợp màn hình quầy thực hiện trong task 1.17. Các đầu việc còn lại của task 1.18 tiếp tục theo kế hoạch sprint.
