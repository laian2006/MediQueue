import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// 2.17: ghi vắng theo T, gọi lại tính lại T, xung đột hai cửa sổ nhân viên và phiên STOPPED,
// qua API 2.11 và PostgreSQL thật. Chạy trên CSDL dev mới migrate + seed, chưa có phiên.
// Đặt NO_SHOW_TIMEOUT_SECONDS nhỏ (ví dụ 8) ở server để chạy nhanh; test đọc T từ API.
const baseURL = process.env.MEDIQUEUE_E2E_URL;
const shots = process.env.MEDIQUEUE_E2E_SHOTS;
const password = 'Demo@12345'; // Mật khẩu seed của CSDL thử.
const api = '/api/v1';
const patients = {
  P001: '10000000-0000-4000-8000-000000000001',
  P002: '10000000-0000-4000-8000-000000000002',
  P003: '10000000-0000-4000-8000-000000000003',
};

test('2.17: ghi vắng, gọi lại tính lại T và hai cửa sổ không làm lệch quầy', { timeout: 240_000 }, async (t) => {
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
  const staffWindow = async (options) => {
    const context = await newContext(options);
    await signIn(context, 'staff_01');
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    return page;
  };
  const button = (page, name) => page.getByRole('button', { name, exact: true });
  const noShowRow = (page) => page.locator('.staff-no-show');
  const message = (page, text) => page.getByText(text, { exact: false }).first();

  const staff = await newContext();
  const rep = await newContext();
  const repB = await newContext();
  await signIn(staff, 'staff_01');
  await signIn(rep, 'rep_a');
  await signIn(repB, 'rep_b'); // P003 thuộc rep_b theo seed.
  let sessionId;
  const queueCurrent = async () => (await (await staff.request.get(`${api}/queue/current`, { params: { sessionId } })).json()).data;
  const current = async () => (await queueCurrent()).ticket;
  const ownerStatus = async (ticketId) => {
    const data = (await (await rep.request.get(`${api}/tickets/${ticketId}`)).json()).data;
    return (data.ticket ?? data).status;
  };
  const issue = async (patientId, actor = rep) => {
    const issued = await actor.request.post(`${api}/tickets`, { data: { patientId, sessionId, requestId: randomUUID() } });
    assert.equal(issued.status(), 201);
    return (await issued.json()).data.ticket;
  };
  // Giữ các lần đọc trạng thái quầy của một cửa sổ: màn hình đó giữ ảnh chụp cũ trong khi đồng hồ vẫn chạy.
  // Request bị giữ làm polling bỏ lượt. Sau khi bấm mới cho chạy tiếp: phản hồi cũ không ghi đè lần đọc mới.
  // (Hủy request bị giữ sẽ làm màn hình báo dữ liệu cũ và khóa nút, đúng thiết kế nhưng không phải ca cần thử.)
  const holdReads = async (page) => {
    const held = [];
    let holding = true;
    await page.route(/\/api\/v1\/(queue\/(current|waiting)|sessions\/current)/, (route) => {
      if (holding && route.request().method() === 'GET') held.push(route);
      else route.continue();
    });
    await page.waitForFunction(() => true); // để route có hiệu lực trước lượt polling kế tiếp
    return {
      // Chờ tới khi polling đã gửi ít nhất một lần đọc và bị giữ lại.
      engaged: async () => { for (let i = 0; i < 50 && held.length === 0; i += 1) await page.waitForTimeout(100); assert.ok(held.length > 0); },
      // Ngừng giữ các lần đọc mới (lần đọc lại sau thao tác phải đi qua).
      stop: () => { holding = false; },
      // Cho các lần đọc cũ đã bị giữ chạy tiếp.
      flush: async () => { await Promise.all(held.splice(0).map((route) => route.continue().catch(() => {}))); },
    };
  };

  const pageA = await staffWindow();
  let T;
  let first;

  await t.test('chuẩn bị: mở phiên, ba số, cửa sổ A gọi số 1', async () => {
    await pageA.goto('/staff');
    await button(pageA, 'Mở phiên').click();
    await message(pageA, 'Đã mở phiên đăng ký.').waitFor();
    sessionId = (await (await staff.request.get(`${api}/sessions/current`)).json()).data.sessionId;
    await issue(patients.P001);
    await issue(patients.P002);
    await issue(patients.P003, repB);
    await pageA.waitForFunction(() => document.querySelectorAll('.staff-queue strong').length === 3, null, { timeout: 7000 });
    await button(pageA, 'Gọi số tiếp theo').click();
    await message(pageA, 'Máy chủ đã xác nhận gọi số 1.').waitFor();
    const data = await queueCurrent();
    T = data.noShowTimeoutSeconds;
    first = data.ticket;
    assert.equal(first.status, 'CALLED');
    assert.ok(T > 0 && T <= 30, `Đặt NO_SHOW_TIMEOUT_SECONDS nhỏ cho E2E, hiện ${T}`);
  });

  await t.test('trước T: Ghi vắng bị khóa, hiện đếm ngược; API cũng từ chối NO_SHOW_TOO_EARLY', async () => {
    await button(pageA, 'Ghi vắng').waitFor();
    assert.equal(await button(pageA, 'Ghi vắng').isEnabled(), false);
    assert.match(await noShowRow(pageA).innerText(), new RegExp(`^Còn \\d+ giây \\(T = ${T} giây\\)$`));
    if (shots) await pageA.screenshot({ path: `${shots}/desktop-countdown.png`, fullPage: true });
    const early = await staff.request.post(`${api}/queue/tickets/${first.ticketId}/no-show`);
    assert.equal(early.status(), 409);
    const body = await early.json();
    assert.equal(body.error.code, 'NO_SHOW_TOO_EARLY');
    assert.ok(body.error.details.remainingSeconds > 0);
    assert.equal((await current()).status, 'CALLED');
  });

  const pageB = await staffWindow();
  await pageB.goto('/staff');
  await button(pageB, 'Gọi lại').waitFor();

  await t.test('đủ T: nút mở; cửa sổ B gọi lại thì cửa sổ A cũ bấm Ghi vắng bị từ chối, T tính lại', async () => {
    await message(pageA, `Đã đủ ${T} giây, có thể ghi vắng`).waitFor({ timeout: (T + 5) * 1000 });
    assert.equal(await button(pageA, 'Ghi vắng').isEnabled(), true);
    const hold = await holdReads(pageA);
    await hold.engaged();
    await button(pageB, 'Gọi lại').click();
    await message(pageB, 'Máy chủ đã xác nhận gọi lại số 1.').waitFor();
    // Cửa sổ A vẫn thấy đã đủ T vì chưa đọc lại; máy chủ mới là nơi quyết định.
    assert.equal(await button(pageA, 'Ghi vắng').isEnabled(), true);
    const response = pageA.waitForResponse((r) => r.url().endsWith('/no-show'));
    hold.stop();
    await button(pageA, 'Ghi vắng').click();
    await hold.flush();
    const rejected = await response;
    assert.equal(rejected.status(), 409);
    assert.equal((await rejected.json()).error.code, 'NO_SHOW_TOO_EARLY');
    await message(pageA, 'Máy chủ từ chối ghi vắng: chưa đủ thời gian chờ kể từ lần gọi gần nhất (còn').waitFor();
    assert.equal(await message(pageA, 'Máy chủ đã xác nhận ghi vắng').count(), 0);
    // Đọc lại: đếm ngược bắt đầu lại từ lần gọi lại.
    await pageA.waitForFunction(() => /^Còn \d+ giây/.test(document.querySelector('.staff-no-show')?.textContent ?? ''));
    assert.equal(await button(pageA, 'Ghi vắng').isEnabled(), false);
    const after = await current();
    assert.equal(after.status, 'CALLED');
    assert.ok(new Date(after.lastCalledAt) > new Date(first.lastCalledAt));
  });

  await t.test('đủ T mới: ghi vắng thành công, quầy rảnh ở cả hai cửa sổ', async () => {
    await message(pageA, `Đã đủ ${T} giây, có thể ghi vắng`).waitFor({ timeout: (T + 5) * 1000 });
    await button(pageA, 'Ghi vắng').click();
    await message(pageA, 'Máy chủ đã xác nhận ghi vắng số 1. Quầy rảnh để gọi số tiếp theo.').waitFor();
    assert.equal(await current(), null);
    assert.equal(await ownerStatus(first.ticketId), 'NO_SHOW');
    await message(pageB, 'Chưa có lượt nào đang được gọi.').waitFor({ timeout: 7000 });
  });

  await t.test('cửa sổ cũ bấm Hoàn tất sau khi cửa sổ khác đã hoàn tất: 409, không báo hoàn tất giả', async () => {
    await button(pageA, 'Gọi số tiếp theo').click();
    await message(pageA, 'Máy chủ đã xác nhận gọi số 2.').waitFor();
    await button(pageA, 'Bắt đầu tiếp nhận').click();
    await button(pageA, 'Hoàn tất đăng ký').waitFor();
    await button(pageB, 'Hoàn tất đăng ký').waitFor({ timeout: 7000 });
    const hold = await holdReads(pageB);
    await hold.engaged();
    await button(pageA, 'Hoàn tất đăng ký').click();
    await message(pageA, 'Máy chủ đã xác nhận hoàn tất đăng ký số 2.').waitFor();
    const response = pageB.waitForResponse((r) => r.url().endsWith('/complete'));
    hold.stop();
    await button(pageB, 'Hoàn tất đăng ký').click();
    await hold.flush();
    const rejected = await response;
    assert.equal(rejected.status(), 409);
    assert.equal((await rejected.json()).error.code, 'INVALID_STATE');
    await message(pageB, 'Máy chủ từ chối: trạng thái phiếu đã thay đổi').waitFor();
    assert.equal(await message(pageB, 'Máy chủ đã xác nhận hoàn tất').count(), 0);
    // Hai cửa sổ cùng khớp máy chủ: quầy rảnh, còn số 3 chờ.
    for (const page of [pageA, pageB]) {
      await message(page, 'Chưa có lượt nào đang được gọi.').waitFor();
      assert.deepEqual(await page.locator('.staff-queue strong').allInnerTexts(), ['3']);
    }
  });

  await t.test('hai cửa sổ bấm cùng lúc Ghi vắng và Bắt đầu: đúng một thao tác được nhận, hai màn hình khớp máy chủ', async () => {
    await button(pageA, 'Gọi số tiếp theo').click();
    await message(pageA, 'Máy chủ đã xác nhận gọi số 3.').waitFor();
    for (const page of [pageA, pageB]) {
      await message(page, `Đã đủ ${T} giây, có thể ghi vắng`).waitFor({ timeout: (T + 8) * 1000 });
    }
    const responses = [
      pageA.waitForResponse((r) => r.url().endsWith('/no-show')),
      pageB.waitForResponse((r) => r.url().endsWith('/start')),
    ];
    await Promise.all([button(pageA, 'Ghi vắng').click(), button(pageB, 'Bắt đầu tiếp nhận').click()]);
    const statuses = (await Promise.all(responses)).map((r) => r.status()).sort();
    assert.deepEqual(statuses, [200, 409]);
    const server = await current();
    // Màn hình nào cũng hiện đúng trạng thái máy chủ sau khi đọc lại.
    const expected = server ? 'Đang tiếp nhận' : 'Chưa có lượt nào đang được gọi.';
    for (const page of [pageA, pageB]) await message(page, expected).waitFor({ timeout: 7000 });
    if (server) {
      await button(pageA, 'Hoàn tất đăng ký').click();
      await message(pageA, 'Máy chủ đã xác nhận hoàn tất đăng ký số 3.').waitFor();
    }
    assert.equal(await current(), null);
  });

  let fourth;
  await t.test('phiên STOPPED: đóng khi còn phiếu bị báo rõ, vẫn gọi và ghi vắng phiếu cũ, xử lý hết mới đóng được', async () => {
    fourth = await issue(patients.P002);
    await pageA.waitForFunction(() => document.querySelectorAll('.staff-queue strong').length === 1, null, { timeout: 7000 });
    await button(pageA, 'Ngừng cấp số').click();
    await message(pageA, 'Đã ngừng cấp số mới.').waitFor();
    const refused = await rep.request.post(`${api}/tickets`, { data: { patientId: patients.P001, sessionId, requestId: randomUUID() } });
    assert.equal(refused.status(), 409);
    assert.equal((await refused.json()).error.code, 'INVALID_STATE');
    await button(pageA, 'Đóng phiên').click();
    await message(pageA, 'Còn phiếu đang chờ hoặc tiếp nhận. Hãy xử lý hết trước khi đóng phiên.').waitFor();
    assert.equal((await (await staff.request.get(`${api}/sessions/current`)).json()).data.status, 'STOPPED');
    await button(pageA, 'Gọi số tiếp theo').click();
    await message(pageA, `Máy chủ đã xác nhận gọi số ${fourth.number}.`).waitFor();
    await message(pageA, `Đã đủ ${T} giây, có thể ghi vắng`).waitFor({ timeout: (T + 5) * 1000 });
  });

  await t.test('mất phản hồi khi ghi vắng: báo chưa có xác nhận, không báo ghi vắng', async () => {
    await pageA.route('**/queue/tickets/*/no-show', (route) => route.abort('connectionreset'));
    await button(pageA, 'Ghi vắng').click();
    await message(pageA, 'Chưa nhận được xác nhận ghi vắng').waitFor();
    assert.equal(await message(pageA, 'Máy chủ đã xác nhận ghi vắng').count(), 0);
    await pageA.unroute('**/queue/tickets/*/no-show');
    assert.equal((await current()).status, 'CALLED');
  });

  await t.test('ghi vắng trong STOPPED rồi đóng phiên thành công', async () => {
    await button(pageA, 'Ghi vắng').waitFor();
    await pageA.waitForFunction(() => {
      const el = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Ghi vắng');
      return el && !el.disabled;
    });
    await button(pageA, 'Ghi vắng').click();
    await message(pageA, `Máy chủ đã xác nhận ghi vắng số ${fourth.number}.`).waitFor();
    assert.equal(await ownerStatus(fourth.ticketId), 'NO_SHOW');
    await button(pageA, 'Đóng phiên').click();
    await message(pageA, 'Đã đóng phiên đăng ký.').waitFor();
    assert.equal((await (await staff.request.get(`${api}/sessions/current`)).json()).data, null);
  });

  await t.test('360 px khi đang đếm ngược: không tràn ngang', async () => {
    const reopened = await staff.request.post(`${api}/sessions`);
    assert.ok([200, 201].includes(reopened.status()));
    sessionId = (await reopened.json()).data.sessionId;
    await issue(patients.P001);
    const called = await staff.request.post(`${api}/queue/call-next`, { data: { sessionId } });
    assert.equal(called.status(), 200);
    const small = await staffWindow({ viewport: { width: 360, height: 780 } });
    await small.goto('/staff');
    await button(small, 'Ghi vắng').waitFor();
    const overflow = await small.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false);
    if (shots) await small.screenshot({ path: `${shots}/mobile-countdown.png`, fullPage: true });
  });
});
