import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// WBS 2.4: ma trận quyền chạy trên app dùng chung với đăng nhập thật và PostgreSQL.
// Không có TEST_DATABASE_URL thì bỏ qua rõ ràng, không giả vờ đã đạt.
const migrationsDir = fileURLToPath(new URL('../../../database/migrations/', import.meta.url));
const seedsDir = fileURLToPath(new URL('../../../database/seeds/', import.meta.url));
const IDS = {
  staff: '00000000-0000-4000-8000-000000000001',
  repA: '00000000-0000-4000-8000-000000000002',
  repB: '00000000-0000-4000-8000-000000000003',
  p1: '10000000-0000-4000-8000-000000000001', // rep_a + rep_b
  p2: '10000000-0000-4000-8000-000000000002', // chỉ rep_a
  p3: '10000000-0000-4000-8000-000000000003', // chỉ rep_b
};

test('WBS 2.4: permission matrix on the shared app with real login and PostgreSQL', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const { default: pg } = await import('pg');
  const { createApp } = await import('../../src/app/app.js');
  const { migrate, seed } = await import('../../src/shared/db/migrations.js');
  const schema = `mq_authz_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^mq_authz_[a-f0-9]{32}$/);
  const config = { clientOrigin: 'http://localhost:5173', sessionSecret: 'test-only-secret-'.repeat(4),
    cookieSecure: false, noShowTimeoutSeconds: 60, sessionSchema: schema };
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let pool;
  let running;
  let schemaCreated = false;
  t.after(async () => {
    try {
      if (running) {
        if (running.server.listening) await new Promise((resolve) => running.server.close(resolve));
        await running.app.locals.sessionStore.close();
      }
      if (pool) await pool.end();
      if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await admin.end();
    }
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
  await migrate(pool, migrationsDir);
  await seed(pool, seedsDir);

  const app = createApp({ pool, config });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  running = { app, server };
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;

  const cookies = {};
  async function call(method, path, who, { json, headers: extra = {} } = {}) {
    const headers = { Origin: config.clientOrigin, ...extra };
    if (who) headers.Cookie = cookies[who];
    let body;
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    const response = await fetch(base + path, { method, headers, body });
    return { status: response.status, body: await response.json().catch(() => null) };
  }
  async function login(who) {
    const response = await fetch(`${base}/auth/login`, { method: 'POST',
      headers: { Origin: config.clientOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: who, password: 'Demo@12345' }) });
    assert.equal(response.status, 200, `login ${who}`);
    cookies[who] = response.headers.get('set-cookie').split(';')[0];
  }
  const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
  // Ảnh chụp dữ liệu: dùng để chứng minh yêu cầu trái quyền không làm đổi CSDL.
  const snapshot = async () => one(`SELECT
    (SELECT count(*)::int FROM tickets) AS tickets,
    (SELECT count(*)::int FROM ticket_events) AS events,
    (SELECT count(*)::int FROM queue_sessions) AS sessions,
    (SELECT coalesce(string_agg(ticket_id::text || ':' || status || ':' || updated_at::text, ',' ORDER BY ticket_id), '') FROM tickets) AS ticket_state,
    (SELECT coalesce(string_agg(session_id::text || ':' || status || ':' || last_issued_number, ',' ORDER BY session_id), '') FROM queue_sessions) AS session_state`);
  const expectDenied = async (label, request, expectedStatus, expectedCode) => {
    const before = await snapshot();
    const res = await request();
    assert.equal(res.status, expectedStatus, `${label}: status ${res.status}`);
    assert.equal(res.body?.error?.code, expectedCode, `${label}: code`);
    assert.equal(res.body?.data, undefined, `${label}: không trả dữ liệu`);
    assert.deepEqual(await snapshot(), before, `${label}: CSDL không đổi`);
  };

  for (const who of ['staff_01', 'rep_a', 'rep_b']) await login(who);
  const opened = await call('POST', '/sessions', 'staff_01', { json: {} });
  assert.equal(opened.status, 201);
  const sessionId = opened.body.data.sessionId;
  const issued = await call('POST', '/tickets', 'rep_a', { json: { patientId: IDS.p2, sessionId, requestId: randomUUID() } });
  assert.equal(issued.status, 201);
  const ticketP2 = issued.body.data.ticket.ticketId; // chỉ rep_a có quyền

  await t.test('401: every private API rejects a request without login; DB unchanged', async () => {
    const routes = [
      ['GET', '/auth/me'],
      ['GET', '/patients'],
      ['GET', '/sessions/current'],
      ['POST', '/sessions', {}],
      ['POST', '/tickets', { patientId: IDS.p2, sessionId, requestId: randomUUID() }],
      ['GET', `/tickets/active?patientId=${IDS.p2}&sessionId=${sessionId}`],
      ['GET', `/tickets/${ticketP2}`],
      ['POST', `/tickets/${ticketP2}/cancel`],
      ['GET', `/queue/waiting?sessionId=${sessionId}`],
      ['GET', `/queue/current?sessionId=${sessionId}`],
      ['POST', '/queue/call-next', { sessionId }],
    ];
    for (const [method, path, json] of routes) {
      await expectDenied(`anonymous ${method} ${path}`, () => call(method, path, null, { json }), 401, 'UNAUTHENTICATED');
    }
  });

  await t.test('401: forged or garbage cookie is treated as not logged in', async () => {
    const res = await fetch(`${base}/patients`, { headers: { Origin: config.clientOrigin, Cookie: 'mediqueue.sid=s%3Aforged.signature' } });
    assert.equal(res.status, 401);
  });

  await t.test('401: session past its absolute expiry is rejected even with a valid cookie', async () => {
    await login('rep_b');
    const stale = cookies.rep_b;
    assert.equal((await call('GET', '/patients', 'rep_b')).status, 200);
    await pool.query(`UPDATE "${schema}".auth_sessions
      SET sess = jsonb_set(sess::jsonb, '{expiresAt}', '"2000-01-01T00:00:00.000Z"')::json`);
    const res = await call('GET', '/patients', 'rep_b');
    assert.equal(res.status, 401);
    // Các phiên khác cũng bị đặt hết hạn: đăng nhập lại để các ca sau dùng phiên mới.
    for (const who of ['staff_01', 'rep_a', 'rep_b']) await login(who);
    assert.notEqual(cookies.rep_b, stale);
  });

  await t.test('403: STAFF cannot use representative APIs (patients, tickets)', async () => {
    await expectDenied('STAFF GET /patients', () => call('GET', '/patients', 'staff_01'), 403, 'FORBIDDEN');
    await expectDenied('STAFF POST /tickets', () => call('POST', '/tickets', 'staff_01',
      { json: { patientId: IDS.p2, sessionId, requestId: randomUUID() } }), 403, 'FORBIDDEN');
    // Body sai nhưng vai trò sai: 403 phải đến trước mọi bước kiểm tra dữ liệu.
    await expectDenied('STAFF POST /tickets bad body', () => call('POST', '/tickets', 'staff_01', { json: { x: 1 } }), 403, 'FORBIDDEN');
    await expectDenied('STAFF POST /tickets without JSON body', () => call('POST', '/tickets', 'staff_01'), 403, 'FORBIDDEN');
    await expectDenied('STAFF POST /tickets/:id/cancel with body', () => call('POST', `/tickets/${ticketP2}/cancel`, 'staff_01', { json: {} }), 403, 'FORBIDDEN');
    await expectDenied('STAFF GET /tickets/active', () => call('GET', `/tickets/active?patientId=${IDS.p2}&sessionId=${sessionId}`, 'staff_01'), 403, 'FORBIDDEN');
    await expectDenied('STAFF GET /tickets/:id', () => call('GET', `/tickets/${ticketP2}`, 'staff_01'), 403, 'FORBIDDEN');
    await expectDenied('STAFF GET /tickets/:id unknown id', () => call('GET', `/tickets/${randomUUID()}`, 'staff_01'), 403, 'FORBIDDEN');
    await expectDenied('STAFF POST /tickets/:id/cancel', () => call('POST', `/tickets/${ticketP2}/cancel`, 'staff_01'), 403, 'FORBIDDEN');
    assert.equal((await one('SELECT status FROM tickets WHERE ticket_id = $1', [ticketP2])).status, 'WAITING');
  });

  await t.test('403: REPRESENTATIVE cannot use staff APIs (sessions, queue)', async () => {
    await expectDenied('REP POST /sessions', () => call('POST', '/sessions', 'rep_a', { json: {} }), 403, 'FORBIDDEN');
    await expectDenied('REP GET /queue/waiting', () => call('GET', `/queue/waiting?sessionId=${sessionId}`, 'rep_a'), 403, 'FORBIDDEN');
    await expectDenied('REP GET /queue/current', () => call('GET', `/queue/current?sessionId=${sessionId}`, 'rep_a'), 403, 'FORBIDDEN');
    await expectDenied('REP POST /queue/call-next', () => call('POST', '/queue/call-next', 'rep_a', { json: { sessionId } }), 403, 'FORBIDDEN');
    assert.equal((await one('SELECT status FROM tickets WHERE ticket_id = $1', [ticketP2])).status, 'WAITING');
  });

  await t.test('allowed: right role passes the permission gate', async () => {
    assert.equal((await call('GET', '/patients', 'rep_a')).status, 200);
    assert.equal((await call('GET', `/tickets/${ticketP2}`, 'rep_a')).status, 200);
    for (const who of ['staff_01', 'rep_a']) assert.equal((await call('GET', '/sessions/current', who)).status, 200);
    for (const path of [`/queue/waiting?sessionId=${sessionId}`, `/queue/current?sessionId=${sessionId}`]) {
      const res = await call('GET', path, 'staff_01');
      assert.ok(![401, 403].includes(res.status), `${path}: ${res.status}`);
    }
  });

  await t.test('IDOR: representative B cannot see, issue for, or cancel a profile only A may access', async () => {
    await expectDenied('rep_b GET ticket of p2', () => call('GET', `/tickets/${ticketP2}`, 'rep_b'), 403, 'FORBIDDEN');
    await expectDenied('rep_b GET active of p2', () => call('GET', `/tickets/active?patientId=${IDS.p2}&sessionId=${sessionId}`, 'rep_b'), 403, 'FORBIDDEN');
    await expectDenied('rep_b POST ticket for p2', () => call('POST', '/tickets', 'rep_b',
      { json: { patientId: IDS.p2, sessionId, requestId: randomUUID() } }), 403, 'FORBIDDEN');
    await expectDenied('rep_b cancel ticket of p2', () => call('POST', `/tickets/${ticketP2}/cancel`, 'rep_b'), 403, 'FORBIDDEN');
    await expectDenied('rep_a POST ticket for p3', () => call('POST', '/tickets', 'rep_a',
      { json: { patientId: IDS.p3, sessionId, requestId: randomUUID() } }), 403, 'FORBIDDEN');
    assert.equal((await one('SELECT status FROM tickets WHERE ticket_id = $1', [ticketP2])).status, 'WAITING');
  });

  await t.test('shared profile: both representatives of p1 are allowed; rights follow the patient, not who issued', async () => {
    const res = await call('POST', '/tickets', 'rep_a', { json: { patientId: IDS.p1, sessionId, requestId: randomUUID() } });
    assert.equal(res.status, 201);
    const ticketP1 = res.body.data.ticket.ticketId;
    assert.equal((await call('GET', `/tickets/${ticketP1}`, 'rep_b')).status, 200);
    assert.equal((await call('POST', `/tickets/${ticketP1}/cancel`, 'rep_b')).status, 200);
    assert.equal((await one('SELECT status FROM tickets WHERE ticket_id = $1', [ticketP1])).status, 'CANCELLED');
    const event = await one(`SELECT u.username FROM ticket_events e JOIN users u ON u.user_id = e.actor_user_id
      WHERE e.ticket_id = $1 AND e.action = 'CANCELLED'`, [ticketP1]);
    assert.equal(event.username, 'rep_b');
  });

  await t.test('spoofing: role/userId/patientId from the client never raise the sender\'s privileges', async () => {
    const spoof = { 'X-Role': 'STAFF', 'X-User-Id': IDS.staff, 'X-User-Role': 'STAFF' };
    await expectDenied('rep + spoofed headers on staff API', () => call('POST', '/sessions', 'rep_a', { json: {}, headers: spoof }), 403, 'FORBIDDEN');
    await expectDenied('rep + role in query on staff API', () => call('GET', `/queue/waiting?sessionId=${sessionId}&role=STAFF&userId=${IDS.staff}`, 'rep_a'), 403, 'FORBIDDEN');
    await expectDenied('rep + role/userId in body on staff API', () => call('POST', '/queue/call-next', 'rep_a',
      { json: { sessionId, role: 'STAFF', userId: IDS.staff } }), 403, 'FORBIDDEN');
    await expectDenied('staff + role in headers on rep API', () => call('GET', '/patients', 'staff_01',
      { headers: { 'X-Role': 'REPRESENTATIVE', 'X-User-Id': IDS.repA } }), 403, 'FORBIDDEN');
    // rep_b khai userId của rep_a và patientId của hồ sơ chỉ rep_a có quyền.
    const before = await snapshot();
    const res = await call('POST', '/tickets', 'rep_b', { headers: { 'X-User-Id': IDS.repA },
      json: { patientId: IDS.p2, sessionId, requestId: randomUUID(), userId: IDS.repA } });
    assert.ok([400, 403].includes(res.status), `status ${res.status}`);
    assert.equal(res.body.data, undefined);
    assert.deepEqual(await snapshot(), before);
    // GET /patients luôn theo người gửi thật, không theo userId trong query.
    const mine = await call('GET', `/patients?userId=${IDS.repA}`, 'rep_b');
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.data.map((p) => p.patientId).sort(), [IDS.p1, IDS.p3].sort());
  });

  await t.test('public APIs stay public: health and login need no cookie', async () => {
    assert.equal((await call('GET', '/health', null)).status, 200);
    const res = await fetch(`${base}/auth/login`, { method: 'POST',
      headers: { Origin: config.clientOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'rep_a', password: 'sai-mat-khau' }) });
    assert.equal(res.status, 401); // sai mật khẩu, không phải do thiếu cookie
  });

  // Rào cho API chưa lập trình: khi chủ API thêm route, test này tự bắt thiếu quyền.
  await t.test('guard for routes not built yet: once registered they must reject anonymous (401) and wrong role (403)', async (sub) => {
    const id = randomUUID();
    const pending = [
      { method: 'POST', path: '/auth/logout', role: 'AUTH' },
      { method: 'POST', path: `/sessions/${id}/stop`, role: 'STAFF' },
      { method: 'POST', path: `/sessions/${id}/close`, role: 'STAFF' },
      { method: 'POST', path: `/queue/tickets/${id}/recall`, role: 'STAFF' },
      { method: 'POST', path: `/queue/tickets/${id}/start`, role: 'STAFF' },
      { method: 'POST', path: `/queue/tickets/${id}/complete`, role: 'STAFF' },
      { method: 'POST', path: `/queue/tickets/${id}/no-show`, role: 'STAFF' },
    ];
    const notBuilt = [];
    for (const route of pending) {
      const anon = await call(route.method, route.path, null, { json: {} });
      if (anon.status === 404 && anon.body?.error?.message === 'Không tìm thấy API.') { notBuilt.push(`${route.method} ${route.path.replace(id, ':id')}`); continue; }
      assert.equal(anon.status, 401, `${route.path}: anonymous`);
      if (route.role === 'STAFF') {
        const rep = await call(route.method, route.path, 'rep_a', { json: {} });
        assert.equal(rep.status, 403, `${route.path}: REPRESENTATIVE`);
      }
    }
    sub.diagnostic(notBuilt.length ? `Chưa có route (cần chủ API gắn quyền khi làm): ${notBuilt.join('; ')}` : 'Mọi route trong danh sách đã có và đúng quyền.');
  });
});
