import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

const baseURL = process.env.MEDIQUEUE_E2E_URL;
const password = 'Demo@12345'; // Mật khẩu seed của CSDL thử.
const api = '/api/v1';
const sharedPatient = '10000000-0000-4000-8000-000000000001';
const privatePatient = '10000000-0000-4000-8000-000000000002';

test('1.14: luồng phiếu người bệnh qua trình duyệt và API thật', { timeout: 60_000 }, async (t) => {
  assert.ok(baseURL, 'Đặt MEDIQUEUE_E2E_URL trỏ đến app với PostgreSQL thử mới chạy seed.');
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: process.env.MEDIQUEUE_E2E_CHROMIUM });
  t.after(() => browser.close());

  const viewport = { width: 360, height: 800 };
  const context = await browser.newContext({ baseURL, viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const headers = { Origin: new URL(baseURL).origin };
  const staff = await browser.newContext({ baseURL, extraHTTPHeaders: headers });
  const repB = await browser.newContext({ baseURL, extraHTTPHeaders: headers });
  const signIn = (actor, username) => actor.request.post(`${api}/auth/login`, { data: { username, password } });
  const profile = page.getByLabel('Hồ sơ người bệnh', { exact: true });
  const issue = page.getByRole('button', { name: 'Lấy số đăng ký', exact: true });
  const card = page.locator('.patient-ticket');

  await t.test('đăng nhập và chỉ thấy hồ sơ được cấp quyền, phiên rỗng không cấp số', async () => {
    await page.goto('/patient');
    await page.getByRole('alert').getByRole('link', { name: 'Đăng nhập' }).click();
    await page.getByLabel('Tên đăng nhập').fill('rep_a');
    await page.getByLabel('Mật khẩu').fill(password);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.waitForURL('**/patient');
    await profile.waitFor();
    assert.deepEqual(await profile.locator('option').evaluateAll((options) => options.map(({ value }) => value)), ['', sharedPatient, privatePatient]);
    await profile.selectOption(privatePatient);
    assert.equal(await issue.isDisabled(), true);
    await page.getByText('Chưa có phiên đăng ký', { exact: true }).waitFor();
  });

  assert.equal((await signIn(staff, 'staff_01')).status(), 200);
  const opened = await staff.request.post(`${api}/sessions`, { data: {} });
  assert.equal(opened.status(), 201, 'Test cần DB thử mới, không có phiên đang chạy.');
  const { data: { sessionId } } = await opened.json();
  await page.reload();
  await profile.selectOption(privatePatient);
  await issue.waitFor();

  let firstTicket;
  await t.test('mất phản hồi sau khi ghi DB, gửi lại cùng body và đọc lại cùng phiếu', async () => {
    const bodies = [];
    await page.route('**/api/v1/tickets', async (route) => {
      bodies.push(route.request().postDataJSON());
      if (bodies.length === 1) {
        const response = await route.fetch();
        assert.equal(response.status(), 201);
        firstTicket = (await response.json()).data.ticket;
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });
    await issue.click();
    await page.getByRole('alert').getByText('Chưa nhận được xác nhận lấy số.', { exact: false }).waitFor();
    assert.equal(await card.count(), 0);
    await page.getByRole('button', { name: 'Thử lại lấy số' }).click();
    await page.getByLabel('Số thứ tự 1', { exact: true }).waitFor();
    assert.equal(bodies.length, 2);
    assert.deepEqual(bodies[1], bodies[0]);
    assert.equal(bodies[0].patientId, privatePatient);
    assert.equal(bodies[0].sessionId, sessionId);
    await page.unrouteAll({ behavior: 'wait' });

    const writesAfterReload = [];
    await page.route('**/api/v1/tickets', (route) => {
      writesAfterReload.push(route.request().method());
      return route.continue();
    });
    await page.reload();
    await profile.selectOption(privatePatient);
    await page.getByLabel('Số thứ tự 1', { exact: true }).waitFor();
    const active = await context.request.get(`${api}/tickets/active`, { params: { patientId: privatePatient, sessionId } });
    assert.equal(active.status(), 200);
    assert.deepEqual((await active.json()).data.ticket, firstTicket);
    assert.deepEqual(writesAfterReload, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.unrouteAll({ behavior: 'wait' });
  });

  await t.test('đổi hồ sơ ẩn phiếu cũ, khi cấp đồng thời đọc lại phiếu đúng quyền', async () => {
    await profile.selectOption(sharedPatient);
    assert.equal(await card.count(), 0);
    await page.getByText('Hồ sơ này chưa có phiếu hoạt động trong phiên.').waitFor();

    assert.equal((await signIn(repB, 'rep_b')).status(), 200);
    const forbidden = await repB.request.get(`${api}/tickets/${firstTicket.ticketId}`);
    assert.equal(forbidden.status(), 403);
    assert.equal((await forbidden.json()).data, undefined);

    const otherIssue = await repB.request.post(`${api}/tickets`, { data: { patientId: sharedPatient, sessionId, requestId: randomUUID() } });
    assert.equal(otherIssue.status(), 201);
    const conflict = page.waitForResponse((response) => response.url().endsWith('/tickets') && response.request().method() === 'POST');
    await issue.click();
    assert.equal((await conflict).status(), 409);
    await page.getByLabel('Số thứ tự 2', { exact: true }).waitFor();
    assert.equal(await card.getByText('P001', { exact: true }).count(), 1);
    const current = await staff.request.get(`${api}/sessions/current`);
    assert.equal((await current.json()).data.lastIssuedNumber, 2);
  });

  await t.test('phản hồi cấp số 201 hiện đúng phiếu của hồ sơ đang chọn', async () => {
    const repPage = await repB.newPage();
    repPage.setDefaultTimeout(5000);
    await repPage.goto('/patient');
    await repPage.getByLabel('Hồ sơ người bệnh', { exact: true }).selectOption({ label: 'P003 — Người bệnh mô phỏng 03' });
    const created = repPage.waitForResponse((response) => response.url().endsWith('/tickets') && response.request().method() === 'POST');
    await repPage.getByRole('button', { name: 'Lấy số đăng ký', exact: true }).click();
    assert.equal((await created).status(), 201);
    await repPage.getByLabel('Số thứ tự 3', { exact: true }).waitFor();
    assert.equal(await repPage.locator('.patient-ticket').getByText('P003', { exact: true }).count(), 1);
  });
});
