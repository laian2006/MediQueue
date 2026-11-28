import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createHttpClient } from '../../../shared/api/http.js';
import { createStaffApi } from '../staff.api.js';

const sessionId = '20000000-0000-4000-8000-000000000001';

function fakeServer(reply) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, method: init.method, body: init.body, credentials: init.credentials, signal: init.signal });
    const { status = 200, body } = reply(url, init);
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  return { requests, api: createStaffApi(createHttpClient({ baseUrl: '/api/v1', fetchImpl })) };
}

test('staff API uses the 1.11 endpoints through http.js with cookies', async () => {
  const { requests, api } = fakeServer((url) => ({ body: { data: url.includes('call-next') ? { number: 5 } : {} } }));
  const controller = new AbortController();
  await api.getCurrentSession({ signal: controller.signal });
  await api.getWaitingQueue({ sessionId });
  await api.getCurrentQueue({ sessionId });
  const called = await api.callNext({ sessionId });

  assert.deepEqual(requests.map(({ method, url }) => `${method} ${url}`), [
    'GET /api/v1/sessions/current',
    `GET /api/v1/queue/waiting?sessionId=${sessionId}`,
    `GET /api/v1/queue/current?sessionId=${sessionId}`,
    'POST /api/v1/queue/call-next',
  ]);
  assert.equal(requests[0].signal, controller.signal);
  assert.ok(requests.every((request) => request.credentials === 'include'));
  // Chỉ gửi sessionId; danh tính lấy từ cookie phía máy chủ.
  assert.deepEqual(JSON.parse(requests[3].body), { sessionId });
  assert.deepEqual(called, { data: { number: 5 } });
});

test('server rejections keep error.code for StaffPage', async () => {
  for (const [status, code] of [[409, 'COUNTER_BUSY'], [409, 'QUEUE_EMPTY'], [401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN']]) {
    const { api } = fakeServer(() => ({ status, body: { error: { code, message: code } } }));
    await assert.rejects(api.callNext({ sessionId }), (error) => error instanceof ApiError
      && error.status === status && error.code === code);
  }
});

test('2.16 ticket actions post to the 2.10 endpoints without body or query', async () => {
  const ticketId = '30000000-0000-4000-8000-000000000004';
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, method: init.method, body: init.body, contentType: init.headers.get('Content-Type') });
    return { status: 200, ok: true, json: async () => ({ data: { ticketId, number: 4 } }) };
  };
  const api = createStaffApi(createHttpClient({ baseUrl: '/api/v1', fetchImpl }));
  for (const name of ['recall', 'start', 'complete', 'noShow']) {
    assert.deepEqual(await api[name]({ ticketId }), { data: { ticketId, number: 4 } });
  }

  assert.deepEqual(requests.map(({ method, url }) => `${method} ${url}`), [
    `POST /api/v1/queue/tickets/${ticketId}/recall`,
    `POST /api/v1/queue/tickets/${ticketId}/start`,
    `POST /api/v1/queue/tickets/${ticketId}/complete`,
    `POST /api/v1/queue/tickets/${ticketId}/no-show`,
  ]);
  // Máy chủ trả 400 nếu có body hoặc Content-Type kèm body.
  assert.ok(requests.every(({ body, contentType }) => body === undefined && contentType === null));
});

test('2.16 ticket action rejections keep error.code', async () => {
  for (const [status, code] of [[409, 'INVALID_STATE'], [404, 'NOT_FOUND'], [401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN']]) {
    const { api } = fakeServer(() => ({ status, body: { error: { code, message: code } } }));
    for (const name of ['recall', 'start', 'complete', 'noShow']) {
      await assert.rejects(api[name]({ ticketId: '30000000-0000-4000-8000-000000000004' }),
        (error) => error instanceof ApiError && error.status === status && error.code === code);
    }
  }
});

test('2.17 NO_SHOW_TOO_EARLY keeps details.remainingSeconds for the message', async () => {
  const { api } = fakeServer(() => ({ status: 409, body: { error: { code: 'NO_SHOW_TOO_EARLY', message: 'early', details: { remainingSeconds: 42 } } } }));
  await assert.rejects(api.noShow({ ticketId: '30000000-0000-4000-8000-000000000004' }),
    (error) => error.code === 'NO_SHOW_TOO_EARLY' && error.details.remainingSeconds === 42);
});
