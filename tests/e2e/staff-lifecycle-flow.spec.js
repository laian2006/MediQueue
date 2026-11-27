import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// 2.16: gọi lại, bắt đầu, hoàn tất trên màn hình quầy, qua API 2.10 và PostgreSQL thật.
// Chạy trên CSDL dev mới migrate + seed, chưa có phiên (giống staff-flow.spec.js).
const baseURL = process.env.MEDIQUEUE_E2E_URL;
const shots = process.env.MEDIQUEUE_E2E_SHOTS;
const password = 'Demo@12345'; // Mật khẩu seed của CSDL thử.
const api = '/api/v1';
const patients = {
  P001: '10000000-0000-4000-8000-000000000001',
  P002: '10000000-0000-4000-8000-000000000002',
};

test('2.16: một lượt đi từ CALLED qua REGISTERING đến COMPLETED trên quầy thật', { timeout: 120_000 }, async (t) => {
  assert.ok(baseURL, 'Đặt MEDIQUEUE_E2E_URL trỏ đến app với PostgreSQL thử mới chạy seed.');
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: process.env.MEDIQUEUE_E2E_CHROMIUM });
  t.after(() => browser.close());

  const headers = { Origin: new URL(baseURL).origin };
  const newContext = (options = {}) => browser.newContext({
    baseURL, extraHTTPHeaders: headers, viewport: { width: 1280, height: 900 }, ...options,
  });
  const signIn = async (context, username) => {
    const response = await context.request.post(`${api}/auth/login`, { data: { username, password } });
    assert.equal(response.status(), 200);
  };
  const openPage = async (context) => {
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    return page;
  };
  const button = (page, name) => page.getByRole('button', { name, exact: true });
  const current = async () => (await (await staff.request.get(`${api}/queue/current`, { params: { sessionId } })).json()).data.ticket;
  const waiting = async () => (await (await staff.request.get(`${api}/queue/waiting`, { params: { sessionId } })).json())
    .data.tickets.map(({ number }) => number);
  const statusText = (page) => page.locator('.staff-panel--current .staff-status').innerText();
  // Đếm request thật gửi đi, để chứng minh bấm lặp chỉ gửi một yêu cầu.
  const countPosts = (page, suffix) => {
    const seen = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith(suffix)) seen.push(request.url());
    });
    return seen;
  };

  const staff = await newContext();
  const rep = await newContext();
  await signIn(staff, 'staff_01');
  await signIn(rep, 'rep_a');
  const page = await openPage(staff);
  let sessionId;
  let first;

  await t.test('chuẩn bị: mở phiên, đại diện lấy hai số, quầy gọi số 1', async () => {
    await page.goto('/staff');
    await button(page, 'Mở phiên').click();
    await page.getByText('Đã mở phiên đăng ký.').waitFor();
    sessionId = (await (await staff.request.get(`${api}/sessions/current`)).json()).data.sessionId;
    for (const patientId of [patients.P001, patients.P002]) {
      const issued = await rep.request.post(`${api}/tickets`, { data: { patientId, sessionId, requestId: randomUUID() } });
      assert.equal(issued.status(), 201);
    }
    await page.waitForFunction(() => document.querySelectorAll('.staff-queue strong').length === 2, null, { timeout: 7000 });
    await button(page, 'Gọi số tiếp theo').click();
    await page.getByText('Máy chủ đã xác nhận gọi số 1.').waitFor();
    first = await current();
    assert.equal(first.number, 1);
    assert.equal(first.status, 'CALLED');
  });

  await t.test('CALLED: có Bắt đầu tiếp nhận và Gọi lại, không cho gọi số mới', async () => {
    await button(page, 'Bắt đầu tiếp nhận').waitFor();
    assert.equal(await button(page, 'Gọi lại').isEnabled(), true);
    assert.equal(await button(page, 'Hoàn tất đăng ký').count(), 0);
    assert.equal(await button(page, 'Gọi số tiếp theo').isEnabled(), false);
    await page.getByText('Quầy đang bận. Cần xử lý xong lượt hiện tại trước khi gọi tiếp.').waitFor();
    assert.equal(await statusText(page), 'Đang gọi');
    if (shots) await page.screenshot({ path: `${shots}/desktop-called-actions.png`, fullPage: true });
  });

  await t.test('gọi lại: giữ số 1, không sinh số mới, cập nhật thời điểm gọi gần nhất', async () => {
    const before = await waiting();
    const response = page.waitForResponse((r) => r.url().endsWith('/recall'));
    await button(page, 'Gọi lại').click();
    assert.equal((await response).status(), 200);
    await page.getByText('Máy chủ đã xác nhận gọi lại số 1. Số thứ tự giữ nguyên.').waitFor();
    const after = await current();
    assert.equal(after.ticketId, first.ticketId);
    assert.equal(after.number, 1);
    assert.equal(after.status, 'CALLED');
    assert.ok(new Date(after.lastCalledAt) > new Date(first.lastCalledAt), 'lastCalledAt phải mới hơn lần gọi đầu');
    assert.deepEqual(await waiting(), before);
    const session = (await (await staff.request.get(`${api}/sessions/current`)).json()).data;
    assert.equal(session.lastIssuedNumber, 2, 'gọi lại không cấp số mới');
  });

  // Cửa sổ thứ hai dừng polling, vẫn thấy CALLED để thử thao tác trên dữ liệu cũ ở ca sau.
  const staleContext = await newContext();
  await signIn(staleContext, 'staff_01');
  const stalePage = await openPage(staleContext);
  await stalePage.clock.install();
  await stalePage.goto('/staff');
  await button(stalePage, 'Gọi lại').waitFor();
  await stalePage.clock.pauseAt(new Date(Date.now() + 1000));

  await t.test('bấm đúp Bắt đầu tiếp nhận: một yêu cầu, chuyển REGISTERING', async () => {
    const posts = countPosts(page, '/start');
    await button(page, 'Bắt đầu tiếp nhận').dblclick();
    await page.getByText('Máy chủ đã xác nhận bắt đầu tiếp nhận số 1.').waitFor();
    await button(page, 'Hoàn tất đăng ký').waitFor();
    assert.equal(posts.length, 1);
    assert.equal(await statusText(page), 'Đang tiếp nhận');
    assert.equal(await button(page, 'Gọi lại').count(), 0);
    if (shots) await page.screenshot({ path: `${shots}/desktop-registering.png`, fullPage: true });
    assert.equal(await button(page, 'Gọi số tiếp theo').isEnabled(), false);
    assert.equal((await current()).status, 'REGISTERING');
  });

  await t.test('cửa sổ cũ bấm Gọi lại khi phiếu đã REGISTERING: 409, không báo thành công, tải lại', async () => {
    const response = stalePage.waitForResponse((r) => r.url().endsWith('/recall'));
    await button(stalePage, 'Gọi lại').click();
    const rejected = await response;
    assert.equal(rejected.status(), 409);
    assert.equal((await rejected.json()).error.code, 'INVALID_STATE');
    await stalePage.getByText('Máy chủ từ chối: trạng thái phiếu đã thay đổi', { exact: false }).waitFor();
    // Tải lại theo máy chủ: cửa sổ cũ giờ thấy REGISTERING và nút Hoàn tất.
    await button(stalePage, 'Hoàn tất đăng ký').waitFor();
    assert.equal(await stalePage.getByText('Máy chủ đã xác nhận', { exact: false }).count(), 0);
    assert.equal((await current()).status, 'REGISTERING');
    await staleContext.close();
  });

  await t.test('tài khoản thường không bắt đầu hay hoàn tất được: 403', async () => {
    for (const action of ['start', 'complete', 'recall']) {
      const response = await rep.request.post(`${api}/queue/tickets/${first.ticketId}/${action}`);
      assert.equal(response.status(), 403);
      assert.equal((await response.json()).error.code, 'FORBIDDEN');
    }
    assert.equal((await current()).status, 'REGISTERING');
  });

  await t.test('mất phản hồi khi hoàn tất: báo chưa có xác nhận, không báo hoàn tất', async () => {
    await page.route('**/queue/tickets/*/complete', (route) => route.abort('connectionreset'));
    await button(page, 'Hoàn tất đăng ký').click();
    await page.getByText('Chưa nhận được xác nhận hoàn tất', { exact: false }).waitFor();
    assert.equal(await page.getByText('Máy chủ đã xác nhận hoàn tất', { exact: false }).count(), 0);
    await page.unroute('**/queue/tickets/*/complete');
    // Đọc lại máy chủ: yêu cầu không tới máy chủ nên lượt vẫn REGISTERING.
    await button(page, 'Hoàn tất đăng ký').waitFor();
    assert.equal((await current()).status, 'REGISTERING');
  });

  await t.test('hoàn tất: COMPLETED, quầy rảnh rồi mới gọi được số 2', async () => {
    await button(page, 'Hoàn tất đăng ký').click();
    await page.getByText('Máy chủ đã xác nhận hoàn tất đăng ký số 1. Quầy rảnh để gọi số tiếp theo.').waitFor();
    await page.getByText('Chưa có lượt nào đang được gọi.').waitFor();
    assert.equal(await current(), null);
    const owner = (await (await rep.request.get(`${api}/tickets/${first.ticketId}`)).json()).data;
    assert.equal((owner.ticket ?? owner).status, 'COMPLETED');
    await button(page, 'Gọi số tiếp theo').click();
    await page.getByText('Máy chủ đã xác nhận gọi số 2.').waitFor();
    assert.equal((await current()).number, 2);
  });

  await t.test('phiên STOPPED vẫn tiếp nhận và hoàn tất phiếu cũ từ quầy', async () => {
    const stopped = await staff.request.post(`${api}/sessions/${sessionId}/stop`);
    assert.equal(stopped.status(), 200);
    await page.reload();
    await button(page, 'Bắt đầu tiếp nhận').click();
    await page.getByText('Máy chủ đã xác nhận bắt đầu tiếp nhận số 2.').waitFor();
    await button(page, 'Hoàn tất đăng ký').click();
    await page.getByText('Máy chủ đã xác nhận hoàn tất đăng ký số 2.', { exact: false }).waitFor();
    assert.equal(await current(), null);
  });

  await t.test('360 px: nút thao tác không tràn ngang', async () => {
    const mobile = await newContext({ viewport: { width: 360, height: 780 } });
    await signIn(mobile, 'staff_01');
    const small = await openPage(mobile);
    await small.goto('/staff');
    await small.getByText('Chưa có lượt nào đang được gọi.').waitFor();
    const overflow = await small.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false);
    if (shots) await small.screenshot({ path: `${shots}/mobile-after-complete.png`, fullPage: true });
    await mobile.close();
  });
});
