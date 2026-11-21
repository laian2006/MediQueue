import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

test('2.2: stop, complete/no-show/cancel remaining tickets, close and open a new session', {
  timeout: 150_000,
}, async t => {
  const baseURL = process.env.MEDIQUEUE_E2E_URL;
  assert.ok(baseURL, 'Set MEDIQUEUE_E2E_URL to a real app with a fresh seeded test database.');
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch({ executablePath: process.env.MEDIQUEUE_E2E_CHROMIUM });
  t.after(() => browser.close());
  const options = { baseURL, extraHTTPHeaders: { Origin: new URL(baseURL).origin } };
  const staff = await browser.newContext(options);
  const repA = await browser.newContext(options);
  const repB = await browser.newContext(options);
  const api = '/api/v1';
  for (const [context, username] of [[staff, 'staff_01'], [repA, 'rep_a'], [repB, 'rep_b']]) {
    const response = await context.request.post(`${api}/auth/login`, {
      data: { username, password: 'Demo@12345' },
    });
    assert.equal(response.status(), 200);
  }
  const page = await staff.newPage();
  page.setDefaultTimeout(10_000);
  await page.goto('/staff');
  const panel = page.getByRole('region', { name: 'Phiên đăng ký', exact: true });
  await panel.getByRole('button', { name: 'Mở phiên', exact: true }).click();
  await panel.getByText('Đang nhận số', { exact: true }).waitFor();
  const session = (await (await staff.request.get(`${api}/sessions/current`)).json()).data;
  const tickets = [];
  for (const [context, patientId] of [
    [repA, '10000000-0000-4000-8000-000000000001'],
    [repA, '10000000-0000-4000-8000-000000000002'],
    [repB, '10000000-0000-4000-8000-000000000003'],
  ]) {
    const response = await context.request.post(`${api}/tickets`, {
      data: { sessionId: session.sessionId, patientId, requestId: randomUUID() },
    });
    assert.equal(response.status(), 201);
    tickets.push((await response.json()).data.ticket);
  }
  const callNext = async () => {
    const response = await staff.request.post(`${api}/queue/call-next`, { data: { sessionId: session.sessionId } });
    assert.equal(response.status(), 200);
    return (await response.json()).data;
  };
  const action = (ticket, name) => staff.request.post(`${api}/queue/tickets/${ticket.ticketId}/${name}`);
  const rejectedClose = async () => {
    await panel.getByRole('button', { name: 'Đóng phiên', exact: true }).click();
    await panel.getByText('Còn phiếu đang chờ hoặc tiếp nhận. Hãy xử lý hết trước khi đóng phiên.', { exact: true }).waitFor();
    assert.equal((await (await staff.request.get(`${api}/sessions/current`)).json()).data.status, 'STOPPED');
  };

  await t.test('STOPPED keeps CALLED/REGISTERING tickets active and allows recall/start/complete', async () => {
    assert.equal((await callNext()).ticketId, tickets[0].ticketId);
    await panel.getByRole('button', { name: 'Ngừng cấp số', exact: true }).click();
    await panel.getByText('Đã ngừng cấp số mới', { exact: true }).waitFor();
    await rejectedClose();
    const recalled = await action(tickets[0], 'recall');
    assert.equal(recalled.status(), 200);
    assert.equal((await recalled.json()).data.number, tickets[0].number);
    assert.equal((await action(tickets[0], 'start')).status(), 200);
    await rejectedClose();
    const completed = await action(tickets[0], 'complete');
    assert.equal(completed.status(), 200);
    assert.equal((await completed.json()).data.status, 'COMPLETED');
  });

  await t.test('no-show checks server timeout and keeps session open while a WAITING ticket remains', async () => {
    assert.equal((await callNext()).ticketId, tickets[1].ticketId);
    const tooEarly = await action(tickets[1], 'no-show');
    assert.equal(tooEarly.status(), 409);
    const error = (await tooEarly.json()).error;
    assert.equal(error.code, 'NO_SHOW_TOO_EARLY');
    assert.ok(error.details.remainingSeconds > 0);
    await rejectedClose();
    // Use the server's actual remaining time, with no SQL timestamp overrides.
    await new Promise(resolve => setTimeout(resolve, error.details.remainingSeconds * 1000 + 100));
    const absent = await action(tickets[1], 'no-show');
    assert.equal(absent.status(), 200);
    assert.equal((await absent.json()).data.status, 'NO_SHOW');
    await rejectedClose();
  });

  await t.test('real cancellation drains the last ticket and the UI closes/reopens at number zero', async () => {
    assert.equal((await repB.request.post(`${api}/tickets/${tickets[2].ticketId}/cancel`)).status(), 200);
    await panel.getByRole('button', { name: 'Đóng phiên', exact: true }).click();
    await panel.getByRole('button', { name: 'Mở phiên', exact: true }).waitFor();
    assert.equal((await (await staff.request.get(`${api}/sessions/current`)).json()).data, null);
    const board = await (await staff.request.get(`${api}/public/board`)).json();
    assert.equal(board.data.currentTicket, null);
    assert.deepEqual(board.data.waitingNumbers, []);
    for (const [ticket, expected] of [[tickets[0], 'COMPLETED'], [tickets[1], 'NO_SHOW'], [tickets[2], 'CANCELLED']]) {
      const context = ticket.ticketId === tickets[2].ticketId ? repB : repA;
      const result = await (await context.request.get(`${api}/tickets/${ticket.ticketId}`)).json();
      assert.equal(result.data.ticket.status, expected);
    }
    await panel.getByRole('button', { name: 'Mở phiên', exact: true }).click();
    await panel.getByText('Đang nhận số', { exact: true }).waitFor();
    const next = (await (await staff.request.get(`${api}/sessions/current`)).json()).data;
    assert.notEqual(next.sessionId, session.sessionId);
    assert.equal(next.lastIssuedNumber, 0);
  });
});
