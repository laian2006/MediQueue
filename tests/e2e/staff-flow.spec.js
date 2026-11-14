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

test('1.17: gọi số từ màn hình quầy qua API 1.11 và PostgreSQL thật', { timeout: 120_000 }, async (t) => {
  assert.ok(baseURL, 'Đặt MEDIQUEUE_E2E_URL trỏ đến app với PostgreSQL thử mới chạy seed.');
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: process.env.MEDIQUEUE_E2E_CHROMIUM });
  t.after(() => browser.close());

  const headers = { Origin: new URL(baseURL).origin };
  const desktop = { width: 1280, height: 900 };
  const newContext = (options = {}) => browser.newContext({ baseURL, extraHTTPHeaders: headers, viewport: desktop, ...options });
  const staff = await newContext();
  const repA = await newContext();
  const repB = await newContext();
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
  const queueLength = (page, n, timeout) => page.waitForFunction((count) => document.querySelectorAll('.staff-queue strong').length === count, n, { timeout });
  const callButton = (page) => page.getByRole('button', { name: /Gọi số tiếp theo|Đang gọi…/ });
  const callResponse = (page) => page.waitForResponse((r) => r.url().endsWith('/queue/call-next'));
  const waitingNumbers = async () => (await (await staff.request.get(`${api}/queue/waiting`, { params: { sessionId } })).json())
    .data.tickets.map(({ number }) => number);
  // Cửa sổ nhân viên giữ ảnh chụp cũ: dừng đồng hồ để polling không chạy.
  // Đồng hồ Playwright áp dụng cho cả context nên mỗi cửa sổ như vậy dùng context riêng.
  const frozenStaffPage = async (count) => {
    const context = await newContext();
    await signIn(context, 'staff_01');
    const page = await staffPage(context);
    await page.clock.install();
    await page.goto('/staff');
    await queueLength(page, count);
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    return page;
  };
  let sessionId;
  const issueAll = async () => {
    const tickets = [];
    for (const [actor, patientId] of [[repA, patients.P002], [repA, patients.P001], [repB, patients.P003]]) {
      const issued = await actor.request.post(`${api}/tickets`, { data: { patientId, sessionId, requestId: randomUUID() } });
      assert.equal(issued.status(), 201);
      tickets.push({ actor, ticket: (await issued.json()).data.ticket });
    }
    return tickets;
  };

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

  await signIn(repA, 'rep_a');
  await signIn(repB, 'rep_b');
  let firstRound;

  await t.test('phiếu thật lấy từ tài khoản đại diện tự hiện trên quầy nhờ polling', async () => {
    firstRound = await issueAll();
    // Polling 3 giây, không tải lại trang.
    await queueLength(pageA, 3, 7000);
    assert.deepEqual(await queue(pageA), ['1', '2', '3']);
    assert.equal(await callButton(pageA).isEnabled(), true);
    // Màn hình không hiện UUID hoặc tên người bệnh.
    assert.doesNotMatch(await pageA.locator('.staff-page').innerText(), /[0-9a-f]{8}-[0-9a-f]{4}-|Người bệnh mô phỏng/);
  });

  await t.test('hết phiên đăng nhập khi bấm gọi: 401, bỏ dữ liệu quầy, không đổi DB', async () => {
    const context = await newContext();
    await signIn(context, 'staff_01');
    const page = await staffPage(context);
    await page.goto('/staff');
    await queueLength(page, 3);
    await context.clearCookies();
    const response = callResponse(page);
    await callButton(page).click();
    assert.equal((await response).status(), 401);
    await page.getByText('Bạn cần đăng nhập bằng tài khoản nhân viên', { exact: false }).first().waitFor();
    assert.equal(await page.getByText('Chưa nhận được xác nhận', { exact: false }).count(), 0);
    assert.equal(await page.locator('.staff-layout').count(), 0);
    assert.deepEqual(await waitingNumbers(), [1, 2, 3]);
    await context.close();
  });

  await t.test('hàng chờ vừa hết ở máy chủ: 409 QUEUE_EMPTY, tải lại thấy hàng rỗng', async () => {
    const page = await frozenStaffPage(3);
    for (const { actor, ticket } of firstRound) {
      const cancelled = await actor.request.post(`${api}/tickets/${ticket.ticketId}/cancel`);
      assert.equal(cancelled.status(), 200);
    }
    assert.deepEqual(await queue(page), ['1', '2', '3']);
    const response = callResponse(page);
    await callButton(page).click();
    assert.equal((await response).status(), 409);
    await page.getByText('hàng chờ đã hết', { exact: false }).waitFor();
    await page.getByText('Hàng chờ đang trống, chưa có số để gọi.').waitFor();
    assert.equal(await page.locator('.staff-ticket-number').count(), 0);
    assert.deepEqual(await waitingNumbers(), []);
    await page.context().close();
  });

  let pageB;
  await t.test('phiếu mới sau khi hủy hiện lại nhờ polling', async () => {
    await issueAll();
    // Cửa sổ A vẫn có thể đang hiện 1, 2, 3 cũ: chờ đúng số mới, không chỉ đủ độ dài.
    await pageA.waitForFunction(() => [...document.querySelectorAll('.staff-queue strong')]
      .map((node) => node.textContent).join(',') === '4,5,6', null, { timeout: 7000 });
    pageB = await frozenStaffPage(3);
  });

  await t.test('bấm hai lần nhanh: một yêu cầu, Ticket thành CALLED trong cơ sở dữ liệu', async () => {
    const posts = [];
    pageA.on('request', (request) => { if (request.url().endsWith('/queue/call-next')) posts.push(request.method()); });
    const response = callResponse(pageA);
    await callButton(pageA).dblclick();
    assert.equal((await response).status(), 200);
    await pageA.getByText('Máy chủ đã xác nhận gọi số 4.').waitFor();
    await pageA.locator('.staff-ticket-number', { hasText: '4' }).waitFor();
    await queueLength(pageA, 2);
    assert.deepEqual(posts, ['POST']);
    assert.equal(await pageA.getByText('Máy chủ đã xác nhận', { exact: false }).count(), 1);
    assert.deepEqual(await queue(pageA), ['5', '6']);
    assert.equal(await callButton(pageA).isDisabled(), true);
    await pageA.getByText('Quầy đang bận. Cần xử lý xong lượt hiện tại trước khi gọi tiếp.').waitFor();

    // Đọc lại từ máy chủ bằng phiên khác của trình duyệt, không dựa vào UI.
    const current = await (await staff.request.get(`${api}/queue/current`, { params: { sessionId } })).json();
    assert.equal(current.data.ticket.number, 4);
    assert.equal(current.data.ticket.status, 'CALLED');
    const owner = await repA.request.get(`${api}/tickets/active`, { params: { patientId: patients.P002, sessionId } });
    assert.equal((await owner.json()).data.ticket.status, 'CALLED');
  });

  await t.test('hai cửa sổ: cửa sổ dữ liệu cũ bị từ chối COUNTER_BUSY và tải lại theo máy chủ', async () => {
    assert.deepEqual(await queue(pageB), ['4', '5', '6']);
    const response = callResponse(pageB);
    await callButton(pageB).click();
    assert.equal((await response).status(), 409);
    await pageB.getByText('quầy đang có lượt khác', { exact: false }).waitFor();
    await queueLength(pageB, 2);
    assert.equal(await pageB.locator('.staff-ticket-number').innerText(), '4');
    assert.equal(await pageB.getByText('Máy chủ đã xác nhận', { exact: false }).count(), 0);
    assert.deepEqual(await waitingNumbers(), [5, 6]);
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
    assert.deepEqual(await waitingNumbers(), [5, 6]);
  });

  await t.test('360 px không tràn ngang', async () => {
    await pageA.setViewportSize({ width: 360, height: 800 });
    assert.equal(await pageA.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.MEDIQUEUE_E2E_SHOTS) {
      await pageA.screenshot({ path: `${process.env.MEDIQUEUE_E2E_SHOTS}/mobile-called-real.png`, fullPage: true });
      await pageA.setViewportSize(desktop);
      await pageA.screenshot({ path: `${process.env.MEDIQUEUE_E2E_SHOTS}/desktop-called-real.png`, fullPage: true });
      await pageB.clock.resume(); // Ảnh chụp cần khung hình chạy tiếp.
      await pageB.screenshot({ path: `${process.env.MEDIQUEUE_E2E_SHOTS}/desktop-conflict-real.png`, fullPage: true });
    }
  });
});
