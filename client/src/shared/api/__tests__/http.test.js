import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createHttpClient } from '../http.js';

test('JSON, session credentials and AbortSignal are preserved', async () => {
  let captured;
  const controller = new AbortController();
  const http = createHttpClient({ fetchImpl: async (url, options) => {
    captured = { url, options };
    return Response.json({ data: { userId: 'user' } });
  } });
  assert.deepEqual(await http.post('/auth/login', { username: 'rep_a' }, { signal: controller.signal }), { data: { userId: 'user' } });
  assert.equal(captured.url, '/api/v1/auth/login');
  assert.equal(captured.options.credentials, 'include');
  assert.equal(captured.options.signal, controller.signal);
  assert.equal(captured.options.headers.get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(captured.options.body), { username: 'rep_a' });
});

test('structured API failures and invalid JSON are errors, never success', async () => {
  const denied = createHttpClient({ fetchImpl: async () => Response.json({ error: { code: 'FORBIDDEN', message: 'Denied', details: { field: 'patient' } } }, { status: 403 }) });
  await assert.rejects(denied.get('/patients'), (e) => e instanceof ApiError && e.status === 403 && e.code === 'FORBIDDEN' && e.details.field === 'patient');
  const invalid = createHttpClient({ fetchImpl: async () => new Response('<html>proxy error</html>', { status: 502 }) });
  await assert.rejects(invalid.get('/health'), (e) => e.code === 'INVALID_RESPONSE' && e.status === 502);
});

test('network errors propagate and 204 has no body', async () => {
  const networkError = new TypeError('offline');
  const offline = createHttpClient({ fetchImpl: async () => { throw networkError; } });
  await assert.rejects(offline.get('/health'), (e) => e === networkError);
  const empty = createHttpClient({ fetchImpl: async () => new Response(null, { status: 204 }) });
  assert.equal(await empty.post('/auth/logout', {}), null);
});
