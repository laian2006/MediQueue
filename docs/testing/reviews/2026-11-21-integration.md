# Kiểm tra tích hợp ngày 21/11/2026

An review API tiếp nhận 2.10, ghi vắng 2.11 và kiểm tra phụ thuộc vòng đời phiên 2.2. Môi trường Windows, Node.js 26.13.1, PostgreSQL 18.6, Playwright Chromium. Nền trước tích hợp `main@4715f09`; các suite API/DB dùng schema riêng và mỗi bộ E2E dùng database mới đã migrate/seed. Dữ liệu local của nhóm được giữ riêng với database kiểm thử.

## Quyết định và mã đã kiểm tra

- [#21](https://github.com/laian2006/MediQueue/pull/21), đầu nhánh `b4e7bc78`. Review khóa phiên trước phiếu, đọc lại trạng thái, giữ số/phiếu khi gọi lại, cập nhật Ticket và TicketEvent cùng giao dịch. Backend **276/276**, lỗi 0, bỏ qua 0. An approve và merge tại `40d4c50`.
- [#22](https://github.com/laian2006/MediQueue/pull/22), đầu nhánh `813ac82a`, chứa phần 2.10 đã review. Backend **301/301**, lỗi 0, bỏ qua 0. Kiểm tra trước/đúng/sau T với đồng hồ PostgreSQL kiểm soát được, ranh giới microsecond, gọi lại tính lại thời hạn, rollback audit và yêu cầu cạnh tranh. An approve và merge tại `95b4d52`.
- Dùng merge commit cho hai PR để giữ quan hệ phụ thuộc, giúp #22 chỉ bổ sung phần ghi vắng sau #21. Mã trong client/server/database/tests trên main sau merge được đối chiếu bằng Git với mã đã kiểm thử và khớp nhau.
- An bổ sung `tests/e2e/session-queue-flow.spec.js`, commit `63bcda2`, để kiểm tra FF 2.2 với các API mới. Bài này dùng HTTP thật và thao tác SessionPanel trên trình duyệt. Không đổi trạng thái hay timestamp bằng SQL trong bộ E2E mới.

## Kết quả

- Backend #21 **276/276**. [Log](../evidence/2-3-2026-11-21/pr21-backend.txt)
- Backend #22 và mã sau merge **301/301**. [Log](../evidence/2-3-2026-11-21/pr22-backend.txt)
- Frontend **13/13**, build đạt. [Test](../evidence/2-3-2026-11-21/frontend.txt), [build](../evidence/2-3-2026-11-21/build.txt)
- E2E phiên kết hợp tiếp nhận/ghi vắng **4/4**, gồm test cha và ba ca con. Chờ thật khoảng 60 giây trước khi ghi vắng qua API. [Log](../evidence/2-3-2026-11-21/session-queue-e2e.txt)
- Hồi quy quầy **12/12**, phiên **7/7**, người bệnh **5/5**, bảng công khai **1/1**. [Quầy](../evidence/2-3-2026-11-21/staff-e2e.txt), [phiên](../evidence/2-3-2026-11-21/session-e2e.txt), [người bệnh](../evidence/2-3-2026-11-21/patient-e2e.txt), [bảng](../evidence/2-3-2026-11-21/board-e2e.txt)

Không có ca bị bỏ qua trong các lần chạy này. Các log là kết quả độc lập An chạy ngày 21/11; log do tác giả đính kèm trước đó được giữ lại trong thư mục của từng task.

## Nghiệm thu quản lý phiên của An

1. Mở phiên, lấy ba phiếu qua API với quyền thật. Gọi phiếu đầu và ngừng cấp qua SessionPanel.
2. Đóng khi CALLED hoặc REGISTERING bị từ chối. Gọi lại, bắt đầu và hoàn tất qua API thật vẫn hoạt động trong STOPPED.
3. Gọi phiếu kế tiếp. Ghi vắng sớm trả `NO_SHOW_TOO_EARLY` kèm số giây còn lại. Chờ đủ thời gian máy chủ rồi ghi vắng thành công.
4. Vẫn còn phiếu WAITING nên chưa được đóng. Hủy phiếu cuối bằng API thật, đóng qua SessionPanel, kiểm tra phiên hiện tại null và bảng công khai rỗng.
5. Phiếu cũ vẫn đọc được với trạng thái COMPLETED/NO_SHOW/CANCELLED. Mở phiên mới có id mới và bộ đếm 0.

Phần kỹ thuật quản lý phiên 2.1/2.2 đã được kiểm tra với phụ thuộc 2.11. Những thao tác tiếp nhận mới trong bài E2E gọi API trực tiếp; các nút tương ứng vẫn thuộc Trung 2.16/2.17.

## Bàn giao tiếp theo

- Trung nối các nút gọi lại/bắt đầu/hoàn tất/ghi vắng, đọc `details.remainingSeconds` khi quá sớm và dùng thời gian từ API. Giữ SessionPanel của An và cơ chế polling/xóa dữ liệu khi 401/403.
- Đạt cập nhật #16 theo main đã có 2.7, 2.10 và 2.11, kiểm tra hủy WAITING và trạng thái NO_SHOW từ API thật.
- Hưng tiếp tục 2.5; Đức Anh tiếp tục bằng chứng 2.8; Trực tiếp tục 2.19/2.20 theo WBS.
- Cập nhật giờ thực tế, review chéo, demo/retro khi các hoạt động diễn ra. Báo cáo kỹ thuật này không xác nhận các hoạt động đó đã hoàn tất.
