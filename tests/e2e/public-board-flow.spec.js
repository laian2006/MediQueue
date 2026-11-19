import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

test('1.20: số lấy ở /patient và gọi ở /staff tự đồng bộ lên /board', { timeout: 60_000 }, async (t) => {
  const baseURL = process.env.MEDIQUEUE_E2E_URL;
  assert.ok(baseURL, 'Đặt MEDIQUEUE_E2E_URL trỏ đến app với PostgreSQL thử mới chạy seed.');
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch({ executablePath: process.env.MEDIQUEUE_E2E_CHROMIUM });
  t.after(() => browser.close());

  const extraHTTPHeaders = { Origin: new URL(baseURL).origin };
  const staff = await browser.newContext({ baseURL, extraHTTPHeaders });
  const representative = await browser.newContext({ baseURL, extraHTTPHeaders });
  const anonymous = await browser.newContext({ baseURL });
  const api = '/api/v1';
  for (const [actor, username] of [[staff, 'staff_01'], [representative, 'rep_a']]) {
    const response = await actor.request.post(`${api}/auth/login`, {
      data: { username, password: 'Demo@12345' },
    });
    assert.equal(response.status(), 200);
  }

  const staffPage = await staff.newPage();
  const patientPage = await representative.newPage();
  const boardPage = await anonymous.newPage();
  for (const page of [staffPage, patientPage, boardPage]) page.setDefaultTimeout(12_000);
  await boardPage.goto('/board');
  await boardPage.getByText('Chưa có số được gọi', { exact: true }).waitFor();
  await staffPage.goto('/staff');
  await staffPage.getByRole('button', { name: 'Mở phiên', exact: true }).click();
  await staffPage.getByText('Đã mở phiên đăng ký.').waitFor();

  await patientPage.goto('/patient');
  const profile = patientPage.getByLabel('Hồ sơ người bệnh', { exact: true });
  const issue = patientPage.getByRole('button', { name: 'Lấy số đăng ký', exact: true });
  for (const [index, number] of [[1, 1], [2, 2]]) {
    await profile.selectOption({ index });
    const issued = patientPage.waitForResponse((response) =>
      response.url().endsWith('/tickets') && response.request().method() === 'POST');
    await issue.click();
    assert.equal((await issued).status(), 201);
    await patientPage.getByLabel(`Số thứ tự ${number}`, { exact: true }).waitFor();
  }

  const staffWaiting = staffPage.locator('.staff-queue strong');
  const boardWaiting = boardPage.getByRole('list', { name: 'Số thứ tự đang chờ' }).getByRole('listitem');
  const asNumbers = async (locator) => (await locator.allInnerTexts()).map(Number);
  await staffWaiting.nth(1).waitFor();
  await boardWaiting.nth(1).waitFor();
  assert.deepEqual(await asNumbers(staffWaiting), [1, 2]);
  assert.deepEqual(await asNumbers(boardWaiting), [1, 2]);

  const call = staffPage.getByRole('button', { name: 'Gọi số tiếp theo' });
  const called = staffPage.waitForResponse((response) => response.url().endsWith('/queue/call-next'));
  await call.click();
  assert.equal((await called).status(), 200);
  const staffCurrent = staffPage.getByRole('region', { name: 'Lượt hiện tại' });
  await staffCurrent.getByText('Quầy bận', { exact: true }).waitFor();
  await staffCurrent.getByText('1', { exact: true }).waitFor();
  await boardPage.getByRole('region', { name: 'Số đang được gọi' }).getByText('001', { exact: true }).waitFor();
  await staffWaiting.filter({ hasText: /^1$/ }).waitFor({ state: 'detached' });
  await boardWaiting.filter({ hasText: /^001$/ }).waitFor({ state: 'detached' });
  assert.deepEqual(await asNumbers(staffWaiting), [2]);
  assert.deepEqual(await asNumbers(boardWaiting), [2]);
  assert.equal(await call.isDisabled(), true);

  const response = await anonymous.request.get(`${api}/public/board`);
  assert.equal(response.status(), 200);
  assert.equal(response.headers()['set-cookie'], undefined);
  const payload = await response.json();
  assert.match(payload.data.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(payload, {
    data: { currentTicket: { number: 1, status: 'CALLED' }, waitingNumbers: [2], updatedAt: payload.data.updatedAt },
  });
});
