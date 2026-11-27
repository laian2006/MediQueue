# Sprint 2 — Tiến độ và bàn giao của An

Đối chiếu GitHub ngày 27/11/2026, mã nguồn `main@80f9264` sau khi ghép phần server 2.5. Sprint 2 theo kế hoạch là tuần 12–13, từ 16–29/11. Phân công, 20 giờ/người/sprint và các phụ thuộc theo [Sprint Plan EN](../planning/MediQueue_Group11_Sprint_Plan.xlsx) và [WBS](../planning/task-map.md). Ngày 23/11 An xác nhận nhóm chưa họp Review/Demo/Retrospective Sprint 2; giờ thực tế và biên bản mới chưa được cung cấp.

## Theo dõi phần việc của An

- [2.1 — Issue #23](https://github.com/laian2006/MediQueue/issues/23), dự kiến 6 giờ. Mã và test đã ghép main. Nhánh [task/2.1](https://github.com/laian2006/MediQueue/tree/task/2.1), commit `91af9e0`, bổ sung hồ sơ và log ngày 23/11, bộ test phiên đạt 35/35. Tiếp tục ghi nhận review của Trực và giờ thực tế.
- [2.2 — Issue #24](https://github.com/laian2006/MediQueue/issues/24), dự kiến 6 giờ. Nhánh [task/2.2](https://github.com/laian2006/MediQueue/tree/task/2.2), commit `65bab2a`, bổ sung kết quả E2E ngày 23/11, SessionPanel 7/7 và phiên với API tiếp nhận/ghi vắng 4/4. Trung tiếp tục đối chiếu khi ghép giao diện quầy đầy đủ.
- [2.3 — Issue #25](https://github.com/laian2006/MediQueue/issues/25), dự kiến 8 giờ gồm tài liệu 2 giờ, phối hợp/review 4 giờ, sự kiện 2 giờ. Đã có hồ sơ thiết kế, review API và kiểm tra tích hợp. Server 2.5 đã ghép qua #28; FF 2.5 còn chờ nghiệm thu giao diện/chuyển tài khoản theo #29. Review chéo, sự kiện và giờ thực tế đang chờ cập nhật.

Đợt bàn giao ngày 23/11 dùng ba nhánh độc lập `task/2.1`, `task/2.2`, `task/2.3-r5`, đều tạo từ `main@d1e3210`. Theo chỉ đạo của An, review qua Issue và commit cụ thể, không mở PR. Sau phản hồi review của Trực, An ghép các nhánh vào main và kiểm tra lại phần liên quan. Các Issue đang mở cho đến khi đủ điều kiện nghiệm thu theo CONTRIBUTING.md.

## Kết quả đã có

- Sprint 1 đã ghép đăng nhập, danh sách hồ sơ, lấy/xem số và gọi số thật trên PostgreSQL. API 1.10/1.11 vào main qua [#13](https://github.com/laian2006/MediQueue/pull/13), UI 1.17 qua [#18](https://github.com/laian2006/MediQueue/pull/18).
- Bảng công khai 1.20 đã ghép qua [#9](https://github.com/laian2006/MediQueue/pull/9) tại `56a946a` ngày 19/11. An chạy độc lập luồng lấy hai số từ `/patient`, gọi ở `/staff` rồi đối chiếu `/board` ẩn danh. Số đang gọi và hàng chờ khớp nhau. Luồng kỹ thuật chính Sprint 1 đã tích hợp, hồ sơ demo/retro và giờ thực tế tiếp tục ghi nhận theo hoạt động thật.
- API hủy WAITING 2.13 đã ghép qua [#15](https://github.com/laian2006/MediQueue/pull/15).
- Đức Anh 2.7 đã được Hưng approve và An kiểm tra bản ghép với `main@5d5940e`, backend 209/209 trên PostgreSQL 18. [#19](https://github.com/laian2006/MediQueue/pull/19) đã merge tại `f402cea`. Góp ý fixture router của Hưng được An sửa trong `1aa15b5`.
- Hưng 2.4 đã ghép qua [#20](https://github.com/laian2006/MediQueue/pull/20) tại `021e80b`. Middleware chặn sai vai trò trước handler; kiểm tra PatientAccess tiếp tục nằm ở service. An chốt giữ 404 cho phiếu không tồn tại và 403 cho hồ sơ ngoài quyền theo hợp đồng v1.0.
- Hoàng Anh 2.10 đã ghép qua [#21](https://github.com/laian2006/MediQueue/pull/21) tại `40d4c50`, backend 276/276. Ghi vắng 2.11 đã ghép qua [#22](https://github.com/laian2006/MediQueue/pull/22) tại `95b4d52`, backend 301/301. An review, chạy lại trên PostgreSQL 18.6 và dùng merge commit để giữ quan hệ phụ thuộc #21 → #22. Các trường trống trong mô tả PR và báo cáo đã được bổ sung bằng kết quả An thực sự chạy.
- Đức Anh 2.8 đã ghép qua [#26](https://github.com/laian2006/MediQueue/pull/26) tại `733fd1b`. Hưng approve, An kiểm tra khóa/trạng thái phiên và chạy backend 309/309, thêm hai lần suite tranh chấp 8/8, E2E người bệnh 5/5 và bảng công khai 1/1. [Review và bằng chứng](../testing/reviews/2026-11-25-concurrency.md), [Issue #27](https://github.com/laian2006/MediQueue/issues/27).
- Hưng bàn giao phần server 2.5 qua [#28](https://github.com/laian2006/MediQueue/pull/28). An review, kiểm tra bản ghép và merge tại `80f9264` ngày 27/11: backend 319/319, bộ quyền/đăng xuất 10/10, E2E người bệnh 5/5 và nhân viên 12/12; chạy lại main sau merge 319/319. API logout đã có; phần UI chuyển tài khoản chưa được nghiệm thu. [Báo cáo và log](../testing/reviews/2026-11-27-auth-logout.md), [Issue #29](https://github.com/laian2006/MediQueue/issues/29).

## Phần việc của An

- **2.1** Mã `b024364` bổ sung stop/close, khóa QueueSession và kiểm tra các phiếu hoạt động trong cùng giao dịch. STOPPED tiếp tục gọi/hủy phiếu cũ. Gửi lặp stop/close hợp lệ giữ nguyên audit. [AC](../requirements/sessions.md), [kiểm thử](../testing/cases/2-1.md)
- **2.2** Mã `c4f4411` bổ sung nút ngừng/đóng, khóa thao tác đang gửi, đối chiếu trạng thái sau lỗi và đồng bộ cửa sổ từ polling của StaffPage. Ngày 21/11, An bổ sung test `63bcda2` và kiểm tra FF với API 2.10/2.11 thật, gồm chờ thực tế T=60 giây, xử lý hết phiếu rồi đóng/mở phiên mới. Bộ tích hợp đạt 4/4. Trung tiếp tục kiểm tra toàn màn hình khi có nút 2.16/2.17. [Kiểm thử](../testing/cases/2-2.md)
- **2.3** Cập nhật mô đun phiên, AC, OpenAPI, README, kết quả kiểm tra và bàn giao phụ thuộc. Đã review/merge #19, #9, #20, #21, #22, #26 và #28; bổ sung kiểm tra test khởi tạo router, giới hạn số tệp test DB đồng thời và nghiệm thu phiên với API tiếp nhận/ghi vắng. Review chéo của Trực, demo/retro và giờ thực tế được ghi khi thực hiện. Server 2.5 đã bàn giao; còn chờ phần phối hợp/kiểm chứng UI theo #29.

Kết quả trên bản mã tổng hợp `1aa15b5` gồm backend 216/216, frontend 9/9, E2E phiên 7/7, quầy 12/12, người bệnh 5/5; build đạt. Các bài thử không có ca bị bỏ qua. Đây là kết quả kiểm tra kỹ thuật; không thay thế bằng chứng demo/retro hoặc đo tải Sprint 3.

Lần tích hợp ngày 19/11 có backend 248/248, frontend 13/13, E2E bảng công khai 1/1, quầy 12/12, phiên 7/7, người bệnh 5/5 và build đạt. [Báo cáo và log tích hợp](../testing/reviews/2026-11-19-integration.md).

Lần tích hợp ngày 21/11 có backend 301/301, frontend 13/13, build và năm bộ E2E đạt, lỗi 0 và bỏ qua 0. Bộ mới kiểm tra phiên với API hoàn tất/ghi vắng/hủy thật đạt 4/4. [Báo cáo và bằng chứng](../testing/reviews/2026-11-21-integration.md).

## Bàn giao theo người phụ trách

- **Hưng** Đã có 1.4–1.6, review #19/#26, ghép 2.4 qua #20 và server 2.5 qua #28. Tiếp tục phối hợp Đạt/Trung kiểm tra UI đăng xuất/chuyển tài khoản theo #29; chưa đóng toàn bộ 2.5. Handler 2.10/2.11 đã có và các ca phân quyền trong bộ test vẫn đạt.
- **Đức Anh** 2.7 và 2.8 đã ghép, có review Hưng và kiểm tra phiên của An. Tiếp tục cập nhật tài liệu/review 2.9, ghi giờ thực tế và các giới hạn kiểm thử đã nêu trong #26. Cấp/gọi/hủy cạnh tranh chung tiếp tục ở đợt kiểm thử tích hợp theo kế hoạch.
- **Hoàng Anh** 1.10/1.11 và API 2.10/2.11 đã ghép, An đã kiểm tra. Bàn giao hợp đồng cho Trung, tiếp tục tài liệu/review 2.12 và phối hợp chạy toàn màn hình quầy. Phiên STOPPED vẫn xử lý phiếu; mọi thao tác ghi khóa phiên trước phiếu.
- **Đạt** 2.13 đã ghép. [#16](https://github.com/laian2006/MediQueue/pull/16) cho 2.14 vẫn Draft ở `b00bb25`. Cập nhật nhánh từ main có 2.7 và API phiên, nối hủy/polling thật, chạy lại E2E và báo rõ phần phụ thuộc 2.11.
- **Trung** 1.17 đã ghép. API 2.10/2.11 đã lên main để nối trực tiếp 2.16/2.17, gồm gọi lại/bắt đầu/hoàn tất và ghi vắng. `SessionPanel` đã có open/stop/close; giữ `currentSession` và callback `onSessionChange` khi cập nhật StaffPage. An đã kiểm tra phần phiên qua API thật, Trung còn nghiệm thu các nút nghiệp vụ mới trên quầy.
- **Trực** 1.20 đã ghép qua #9. Tiếp tục nhật ký/bảng đầy đủ 2.19, môi trường tích hợp 2.20 và tài liệu 2.21. Test backend qua `npm test` hiện giới hạn tối đa bốn tệp chạy song song; các ca cạnh tranh trong từng tệp vẫn chạy theo kịch bản đã viết.

Các task nêu trên giữ nguyên chủ trì và lịch trong Excel. Chưa thấy PR chỉ phản ánh bằng chứng trên GitHub; thành viên có thể đang làm ở máy riêng.

## Trình tự nghiệm thu tiếp theo

1. Dùng luồng `/patient` → `/staff` → `/board` đã ghép để thực hiện review/demo Sprint 1 và ghi kết quả thực tế.
2. 2.8 và server 2.5 đã ghép; Đạt hoàn thiện 2.14 với API hủy và requestId thật. Hưng phối hợp Đạt/Trung hoàn thiện và kiểm chứng UI đăng xuất/chuyển tài khoản theo #29.
3. Trung ghép 2.16/2.17 với API 2.10/2.11 đã có, chạy lại luồng đầy đủ qua các nút trên quầy. Phần FF 2.2 với API thật đã được An kiểm tra.
4. Ghi kết quả review/demo, phản hồi, việc chuyển tiếp và giờ thực tế vào hồ sơ sprint trước khi đánh dấu Done toàn bộ.

## Chuẩn bị Review/Demo/Retrospective Sprint 2

Trạng thái ngày 23/11 là chưa diễn ra. Nội dung dưới đây chuẩn bị cho buổi họp và được cập nhật theo kết quả thực tế sau đó.

1. Ghi ngày, người tham dự và commit được demo. Chạy ứng dụng với database thử và seed riêng.
2. Nhân viên mở phiên, người đại diện lấy số, đối chiếu quầy và bảng công khai. Ngừng cấp số, kiểm tra yêu cầu cấp mới bị từ chối.
3. Chạy tiếp nhận/ghi vắng/hủy với phần đã ghép; kiểm tra còn phiếu thì chưa đóng được. Xử lý hết phiếu, đóng và mở phiên mới với bộ đếm 0. Ghi rõ thao tác nào dùng giao diện và thao tác nào gọi API.
4. Đối chiếu quyền và gửi lại requestId. Kiểm tra phần 2.5 sau khi Hưng bàn giao.
5. Review theo AC, ghi ca đạt/chưa đạt, lỗi và người xử lý. Retrospective ghi điều cần giữ, vấn đề đã gặp, biện pháp, chủ trì và mốc xử lý do nhóm thống nhất.

Biên bản sau họp cần có ngày, người tham dự, kết quả demo, phản hồi, quyết định và bằng chứng. An bổ sung giờ thực tế lũy kế cùng ước lượng giờ còn lại vào các Issue theo công việc đã thực hiện.
