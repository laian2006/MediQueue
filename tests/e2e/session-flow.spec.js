import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import test from 'node:test';

const baseURL = process.env.MEDIQUEUE_E2E_URL;
const prefix = '/api/v1';

test('2.2: session controls on the real staff screen', { timeout: 90_000 }, async t => {
  assert.ok(baseURL, 'Set MEDIQUEUE_E2E_URL to an app with a fresh, seeded test database.');
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ executablePath: process.env.MEDIQUEUE_E2E_CHROMIUM });
  t.after(() => browser.close());
  const contextOptions = { baseURL, extraHTTPHeaders: { Origin: new URL(baseURL).origin },
    viewport: { width: 1280, height: 900 } };
  const staff = await browser.newContext(contextOptions);
  const other = await browser.newContext(contextOptions);
  const rep = await browser.newContext(contextOptions);
  async function login(context, username) {
    assert.equal((await context.request.post(`${prefix}/auth/login`, {
      data: { username, password: 'Demo@12345' },
    })).status(), 200);
  }
  await login(staff, 'staff_01');
  await login(other, 'staff_01');
  await login(rep, 'rep_a');
  const page = await staff.newPage();
  const second = await other.newPage();
  page.setDefaultTimeout(8000);
  second.setDefaultTimeout(8000);
  const panel = target => target.getByRole('region', { name: 'Phiên đăng ký', exact: true });
  const current = async () => (await (await staff.request.get(`${prefix}/sessions/current`)).json()).data;
  let firstId;

  await t.test('opens once, syncs another window, stops and closes an empty session', async () => {
    await page.goto('/staff');
    await second.goto('/staff');
    await panel(page).getByRole('button', { name: 'Mở phiên', exact: true }).click();
    await panel(page).getByText('Đang nhận số', { exact: true }).waitFor();
    await panel(second).getByText('Đang nhận số', { exact: true }).waitFor();
    firstId = (await current()).sessionId;
    await panel(page).getByRole('button', { name: 'Ngừng cấp số', exact: true }).click();
    await panel(page).getByText('Đã ngừng cấp số mới', { exact: true }).waitFor();
    await panel(second).getByText('Đã ngừng cấp số mới', { exact: true }).waitFor();
    assert.equal((await current()).status, 'STOPPED');
    await panel(page).getByRole('button', { name: 'Đóng phiên', exact: true }).click();
    await panel(page).getByText('Đã đóng phiên đăng ký.', { exact: true }).waitFor();
    await panel(second).getByRole('button', { name: 'Mở phiên', exact: true }).waitFor();
    assert.equal(await current(), null);
    assert.equal((await staff.request.post(`${prefix}/sessions/${firstId}/close`)).status(), 200);
  });

  let sessionId;
  const tickets = [];
  await t.test('new session starts at zero; real tickets arrive in both windows', async () => {
    await panel(page).getByRole('button', { name: 'Mở phiên', exact: true }).click();
    await panel(page).getByText('Đang nhận số', { exact: true }).waitFor();
    const session = await current();
    sessionId = session.sessionId;
    assert.notEqual(sessionId, firstId);
    assert.equal(session.lastIssuedNumber, 0);
    for (const patientId of ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002']) {
      const response = await rep.request.post(`${prefix}/tickets`, { data: { sessionId, patientId, requestId: randomUUID() } });
      assert.equal(response.status(), 201);
      tickets.push((await response.json()).data.ticket);
    }
    await page.waitForFunction(() => document.querySelectorAll('.staff-queue strong').length === 2);
    await second.waitForFunction(() => document.querySelectorAll('.staff-queue strong').length === 2);
  });

  await t.test('double stop sends once; STOPPED rejects new tickets and keeps old tickets', async () => {
    let writes = 0;
    const count = request => { if (request.method() === 'POST' && request.url().endsWith('/stop')) writes += 1; };
    page.on('request', count);
    await panel(page).getByRole('button', { name: 'Ngừng cấp số', exact: true }).dblclick();
    await panel(page).getByText('Đã ngừng cấp số mới', { exact: true }).waitFor();
    await panel(second).getByText('Đã ngừng cấp số mới', { exact: true }).waitFor();
    page.off('request', count);
    assert.equal(writes, 1);
    const response = await rep.request.post(`${prefix}/tickets`, { data: { sessionId,
      patientId: tickets[0].patientId, requestId: randomUUID() } });
    assert.equal(response.status(), 409);
    assert.equal((await response.json()).error.code, 'INVALID_STATE');
    assert.deepEqual(await page.locator('.staff-queue strong').allInnerTexts(), ['1', '2']);
  });

  await t.test('close refuses active tickets; real cancellations allow close and clear the other window', async () => {
    await panel(page).getByRole('button', { name: 'Đóng phiên', exact: true }).click();
    await panel(page).getByText('Còn phiếu đang chờ hoặc tiếp nhận. Hãy xử lý hết trước khi đóng phiên.', { exact: true }).waitFor();
    assert.equal((await current()).status, 'STOPPED');
    for (const ticket of tickets) {
      assert.equal((await rep.request.post(`${prefix}/tickets/${ticket.ticketId}/cancel`)).status(), 200);
    }
    await panel(page).getByRole('button', { name: 'Đóng phiên', exact: true }).click();
    await panel(page).getByRole('button', { name: 'Mở phiên', exact: true }).waitFor();
    await panel(second).getByRole('button', { name: 'Mở phiên', exact: true }).waitFor();
    assert.equal(await current(), null);
    assert.equal(await second.locator('.staff-queue strong').count(), 0);
  });

  await t.test('lost stop response shows uncertainty and reloads the committed state', async () => {
    await panel(page).getByRole('button', { name: 'Mở phiên', exact: true }).click();
    await panel(page).getByText('Đang nhận số', { exact: true }).waitFor();
    await page.route('**/api/v1/sessions/*/stop', async route => {
      assert.equal((await route.fetch()).status(), 200);
      await route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE' } } });
    });
    await panel(page).getByRole('button', { name: 'Ngừng cấp số', exact: true }).click();
    await panel(page).getByText('Chưa nhận được xác nhận thao tác. Đã tải lại trạng thái phiên từ máy chủ.', { exact: true }).waitFor();
    await panel(page).getByRole('button', { name: 'Đóng phiên', exact: true }).waitFor();
    assert.equal((await current()).status, 'STOPPED');
    assert.equal(await panel(page).getByText('Đã ngừng cấp số mới. Tiếp tục xử lý các phiếu còn lại.', { exact: true }).count(), 0);
    await page.unrouteAll({ behavior: 'wait' });
  });

  await t.test('360px layout remains within the viewport', async () => {
    await panel(page).getByRole('button', { name: 'Tải lại phiên', exact: true }).click();
    await panel(page).getByRole('button', { name: 'Đóng phiên', exact: true }).waitFor();
    if (process.env.MEDIQUEUE_E2E_EVIDENCE) {
      await mkdir(process.env.MEDIQUEUE_E2E_EVIDENCE, { recursive: true });
      await page.screenshot({ path: `${process.env.MEDIQUEUE_E2E_EVIDENCE}/session-desktop.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 360, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    if (process.env.MEDIQUEUE_E2E_EVIDENCE) {
      await mkdir(process.env.MEDIQUEUE_E2E_EVIDENCE, { recursive: true });
      await page.screenshot({ path: `${process.env.MEDIQUEUE_E2E_EVIDENCE}/session-mobile.png`, fullPage: true });
    }
    await panel(page).getByRole('button', { name: 'Đóng phiên', exact: true }).click();
    await panel(page).getByRole('button', { name: 'Mở phiên', exact: true }).waitFor();
  });
});
