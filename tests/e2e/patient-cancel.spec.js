import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';

const baseURL = process.env.MEDIQUEUE_E2E_URL;
const databaseURL = process.env.MEDIQUEUE_E2E_DATABASE_URL;
const password = 'Demo@12345';
const api = '/api/v1';
const sharedPatient = '10000000-0000-4000-8000-000000000001';
const privatePatient = '10000000-0000-4000-8000-000000000002';

test('2.14: hủy, cập nhật vị trí, mất mạng và xung đột với lượt gọi', { timeout: 60_000 }, async (t) => {
  assert.ok(baseURL && databaseURL, 'Cần app và PostgreSQL thử mới chạy seed, chưa mở phiên.');
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const requireServer = createRequire(new URL('../../server/package.json', import.meta.url));
  const { Pool } = requireServer('pg');
  const db = new Pool({ connectionString: databaseURL });
  t.after(() => db.end());
  const browser = await chromium.launch({ executablePath: process.env.MEDIQUEUE_E2E_CHROMIUM });
  t.after(() => browser.close());
  const headers = { Origin: new URL(baseURL).origin };
  const staff = await browser.newContext({ baseURL, extraHTTPHeaders: headers });
  const context = await browser.newContext({ baseURL, viewport: { width: 360, height: 800 }, extraHTTPHeaders: headers });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);

  const signIn = (actor, username) => actor.request.post(`${api}/auth/login`, { data: { username, password } });
  assert.equal((await signIn(staff, 'staff_01')).status(), 200);
  const opened = await staff.request.post(`${api}/sessions`, { data: {} });
  assert.equal(opened.status(), 201, 'Test cần DB thử mới, chưa có phiên đang chạy.');
  const { data: { sessionId } } = await opened.json();
  assert.equal((await signIn(context, 'rep_a')).status(), 200);

  const issue = (patientId) => context.request.post(`${api}/tickets`, { data: { patientId, sessionId, requestId: randomUUID() } });
  const first = await issue(privatePatient);
  assert.equal(first.status(), 201);
  const second = await issue(sharedPatient);
  assert.equal(second.status(), 201);
  const { data: { ticket: tracked } } = await second.json();

  await page.goto('/patient');
  const profile = page.getByLabel('Hồ sơ người bệnh', { exact: true });
  const card = page.locator('.patient-ticket');
  const cancelButton = page.getByRole('button', { name: 'Hủy phiếu', exact: true });
  await profile.selectOption(sharedPatient);
  await page.getByLabel('Số thứ tự 2', { exact: true }).waitFor();
  assert.equal(await card.locator('dd').last().textContent(), '1');

  // Another browser cancels the ticket in front through the real API.
  const other = await context.newPage();
  await other.goto('/patient');
  await other.getByLabel('Hồ sơ người bệnh', { exact: true }).selectOption(privatePatient);
  const firstCancelled = other.waitForResponse((res) => res.url().endsWith('/cancel'));
  await other.getByRole('button', { name: 'Hủy phiếu', exact: true }).click();
  assert.equal((await firstCancelled).status(), 200);
  await other.getByText('Đã hủy', { exact: true }).waitFor();
  await other.getByRole('button', { name: 'Lấy số đăng ký', exact: true }).waitFor();
  assert.equal(await other.getByRole('button', { name: 'Lấy số đăng ký', exact: true }).isEnabled(), true);
  await other.close();
  await page.getByText('Không còn phiếu đang chờ phía trước.', { exact: false }).waitFor();
  assert.equal(await card.locator('dd').last().textContent(), '0');

  await context.setOffline(true);
  await page.getByText('Chưa kết nối được để cập nhật. Dữ liệu từ', { exact: false }).waitFor();
  assert.equal(await cancelButton.isDisabled(), true);
  await page.getByLabel('Số thứ tự 2', { exact: true }).waitFor();
  await context.setOffline(false);
  await page.getByText('Chưa kết nối được để cập nhật. Dữ liệu từ', { exact: false }).waitFor({ state: 'hidden' });

  await page.route('**/api/v1/tickets/*/cancel', async (route) => {
    // Staff queue API is developed separately. Set the called state just before the real cancel request.
    await db.query(`UPDATE tickets SET status = 'CALLED', last_called_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE ticket_id = $1`, [tracked.ticketId]);
    await route.continue();
  });
  const conflict = page.waitForResponse((res) => res.url().endsWith('/cancel'));
  await cancelButton.click();
  assert.equal((await conflict).status(), 409);
  await card.getByText('Đã được gọi', { exact: true }).waitFor();
  assert.equal(await cancelButton.count(), 0);
  assert.equal(await card.getByText('Đã hủy', { exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  await profile.selectOption(privatePatient);
  await page.getByText('Hồ sơ này chưa có phiếu hoạt động trong phiên.').waitFor();
  assert.equal(await card.count(), 0);

  await page.goto('/patient-demo');
  await profile.selectOption(sharedPatient);
  await page.getByLabel('Số thứ tự 12', { exact: true }).waitFor();
  assert.equal(await cancelButton.count(), 0);
});
