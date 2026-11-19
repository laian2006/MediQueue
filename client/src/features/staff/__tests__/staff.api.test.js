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
