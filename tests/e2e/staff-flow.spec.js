import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

const baseURL = process.env.MEDIQUEUE_E2E_URL;
const password = 'Demo@12345'; // Mật khẩu seed của CSDL thử.
const api = '/api/v1';
const patients = {
  P001: '10000000-0000-4000-8000-000000000001',
  P002: '10000000-0000-4000-8000-000000000002',
  P003: '10000000-0000-4000-8000-000000000003',
};

test('1.17: gọi số từ màn hình quầy qua API 1.11 và PostgreSQL thật', { timeout: 90_000 }, async (t) => {
  assert.ok(baseURL, 'Đặt MEDIQUEUE_E2E_URL trỏ đến app với PostgreSQL thử mới chạy seed.');
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: process.env.MEDIQUEUE_E2E_CHROMIUM });
  t.after(() => browser.close());

  const headers = { Origin: new URL(baseURL).origin };
  const staff = await browser.newContext({ baseURL, extraHTTPHeaders: headers, viewport: { width: 1280, height: 900 } });
  const repA = await browser.newContext({ baseURL, extraHTTPHeaders: headers });
  const repB = await browser.newContext({ baseURL, extraHTTPHeaders: headers });
  const signIn = async (actor, username) => {
    const response = await actor.request.post(`${api}/auth/login`, { data: { username, password } });
    assert.equal(response.status(), 200);
  };
  const staffPage = async (context) => {
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    return page;
  };
  const queue = (page) => page.locator('.staff-queue strong').allInnerTexts();
  const callButton = (page) => page.getByRole('button', { name: /Gọi số tiếp theo|Đang gọi…/ });
  let sessionId;

  await t.test('chưa đăng nhập: không hiện dữ liệu quầy', async () => {
    const anonymous = await browser.newContext({ baseURL });
    const page = await staffPage(anonymous);
    await page.goto('/staff');
    await page.getByText('Bạn cần đăng nhập bằng tài khoản nhân viên', { exact: false }).first().waitFor();
    assert.equal(await callButton(page).count(), 0);
    assert.equal(await page.locator('.staff-layout').count(), 0);
    await anonymous.close();
  });

  await signIn(staff, 'staff_01');
  const pageA = await staffPage(staff);

  await t.test('mở phiên bằng SessionPanel, StaffPage đọc lại qua onSessionChange', async () => {
    await pageA.goto('/staff');
    await pageA.getByText('Chưa có phiên. Cần mở phiên trước khi gọi.').waitFor();
    await pageA.getByRole('button', { name: 'Mở phiên', exact: true }).click();
    await pageA.getByText('Đã mở phiên đăng ký.').waitFor();
    // Không bấm tải lại: hàng chờ hiện ngay vì SessionPanel gọi onSessionChange.
    await pageA.getByText('Hàng chờ đang trống, chưa có số để gọi.').waitFor();
    const current = await staff.request.get(`${api}/sessions/current`);
    sessionId = (await current.json()).data.sessionId;
    assert.ok(sessionId);
  });

  await t.test('phiếu thật lấy từ tài khoản đại diện tự hiện trên quầy nhờ polling', async () => {
    await signIn(repA, 'rep_a');
    await signIn(repB, 'rep_b');
    for (const [actor, patientId] of [[repA, patients.P002], [repA, patients.P001], [repB, patients.P003]]) {
      const issued = await actor.request.post(`${api}/tickets`, { data: { patientId, sessionId, requestId: randomUUID() } });
      assert.equal(issued.status(), 201);
    }
    // Polling 3 giây, không tải lại trang.
    await pageA.waitForFunction(() => document.querySelectorAll('.staff-queue strong').length === 3, null, { timeout: 7000 });
    assert.deepEqual(await queue(pageA), ['1', '2', '3']);
    assert.equal(await callButton(pageA).isEnabled(), true);
    // Màn hình không hiện UUID hoặc tên người bệnh.
    assert.doesNotMatch(await pageA.locator('.staff-page').innerText(), /[0-9a-f]{8}-[0-9a-f]{4}-|Người bệnh mô phỏng/);
  });

  // Cửa sổ thứ hai cùng tài khoản giữ ảnh chụp cũ: dừng đồng hồ để polling không chạy.
  // Đồng hồ Playwright áp dụng cho cả context nên cửa sổ này dùng context riêng.
  const staffB = await browser.newContext({ baseURL, extraHTTPHeaders: headers, viewport: { width: 1280, height: 900 } });
  await signIn(staffB, 'staff_01');
  const pageB = await staffPage(staffB);
  await pageB.clock.install();
  await pageB.goto('/staff');
  await pageB.waitForFunction(() => document.querySelectorAll('.staff-queue strong').length === 3);
  await pageB.clock.pauseAt(new Date(Date.now() + 1000));

  await t.test('gọi số đổi Ticket thành CALLED trong cơ sở dữ liệu', async () => {
    const response = pageA.waitForResponse((r) => r.url().endsWith('/queue/call-next'));
    await callButton(pageA).click();
    assert.equal((await response).status(), 200);
    await pageA.getByText('Máy chủ đã xác nhận gọi số 1.').waitFor();
    await pageA.locator('.staff-ticket-number', { hasText: '1' }).waitFor();
    await pageA.waitForFunction(() => document.querySelectorAll('.staff-queue strong').length === 2);
    assert.deepEqual(await queue(pageA), ['2', '3']);
    assert.equal(await callButton(pageA).isDisabled(), true);
    await pageA.getByText('Quầy đang bận. Cần xử lý xong lượt hiện tại trước khi gọi tiếp.').waitFor();

    // Đọc lại từ máy chủ bằng phiên khác của trình duyệt, không dựa vào UI.
    const current = await (await staff.request.get(`${api}/queue/current`, { params: { sessionId } })).json();
    assert.equal(current.data.ticket.number, 1);
    assert.equal(current.data.ticket.status, 'CALLED');
    const owner = await repA.request.get(`${api}/tickets/active`, { params: { patientId: patients.P002, sessionId } });
    assert.equal((await owner.json()).data.ticket.status, 'CALLED');
  });

  await t.test('hai cửa sổ: cửa sổ dữ liệu cũ bị từ chối và tải lại theo máy chủ', async () => {
    assert.deepEqual(await queue(pageB), ['1', '2', '3']);
    const response = pageB.waitForResponse((r) => r.url().endsWith('/queue/call-next'));
    await callButton(pageB).click();
    assert.equal((await response).status(), 409);
    await pageB.getByText('quầy đang có lượt khác', { exact: false }).waitFor();
    await pageB.waitForFunction(() => document.querySelectorAll('.staff-queue strong').length === 2);
    assert.equal(await pageB.locator('.staff-ticket-number').innerText(), '1');
    assert.equal(await pageB.getByText('Máy chủ đã xác nhận', { exact: false }).count(), 0);
    const waiting = await (await staff.request.get(`${api}/queue/waiting`, { params: { sessionId } })).json();
    assert.deepEqual(waiting.data.tickets.map(({ number }) => number), [2, 3]);
  });

  await t.test('tài khoản thường không vận hành được quầy', async () => {
    const page = await staffPage(repA);
    await page.goto('/staff');
    await page.getByText('Tài khoản này không có quyền vận hành quầy.', { exact: false }).waitFor();
    assert.equal(await callButton(page).count(), 0);
    assert.deepEqual(await queue(page), []);
    const direct = await repA.request.post(`${api}/queue/call-next`, { data: { sessionId } });
    assert.equal(direct.status(), 403);
    assert.equal((await direct.json()).error.code, 'FORBIDDEN');
    const waiting = await (await staff.request.get(`${api}/queue/waiting`, { params: { sessionId } })).json();
    assert.deepEqual(waiting.data.tickets.map(({ number }) => number), [2, 3]);
  });

  await t.test('360 px không tràn ngang', async () => {
    await pageA.setViewportSize({ width: 360, height: 800 });
    assert.equal(await pageA.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.MEDIQUEUE_E2E_SHOTS) {
      await pageA.screenshot({ path: `${process.env.MEDIQUEUE_E2E_SHOTS}/mobile-called-real.png`, fullPage: true });
      await pageA.setViewportSize({ width: 1280, height: 900 });
      await pageA.screenshot({ path: `${process.env.MEDIQUEUE_E2E_SHOTS}/desktop-called-real.png`, fullPage: true });
      await pageB.clock.resume(); // Ảnh chụp cần khung hình chạy tiếp.
      await pageB.screenshot({ path: `${process.env.MEDIQUEUE_E2E_SHOTS}/desktop-conflict-real.png`, fullPage: true });
    }
  });
});
