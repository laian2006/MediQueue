import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// WBS 2.5 (Hưng): quyền theo mã hồ sơ với nhiều người đại diện, và đăng xuất.
// Chạy trên app dùng chung, đăng nhập cookie thật, PostgreSQL thật. Không có TEST_DATABASE_URL
// thì bỏ qua rõ ràng, không giả vờ đã đạt. Dữ liệu thêm chỉ nằm trong schema thử tạm.
const migrationsDir = fileURLToPath(new URL('../../../database/migrations/', import.meta.url));
const seedsDir = fileURLToPath(new URL('../../../database/seeds/', import.meta.url));
const ID = {
  staff: '00000000-0000-4000-8000-000000000001',
  repA: '00000000-0000-4000-8000-000000000002',
  repB: '00000000-0000-4000-8000-000000000003',
};
const PROFILES = ['P001', 'P002', 'P003', 'P004'];

// Ma trận mong đợi, ghi trước khi chạy (task 2.5, bước 1).
// P001 dùng chung rep_a + rep_b; P002 riêng rep_a; P003 riêng rep_b; P004 không ai có quyền.
// rep_c là đại diện chưa được cấp hồ sơ nào. Mỗi thao tác trên hồ sơ đều theo cùng một quy tắc.
const MATRIX = {
  rep_a: { P001: 'ALLOW', P002: 'ALLOW', P003: 'DENY', P004: 'DENY' },
  rep_b: { P001: 'ALLOW', P002: 'DENY', P003: 'ALLOW', P004: 'DENY' },
  rep_c: { P001: 'DENY', P002: 'DENY', P003: 'DENY', P004: 'DENY' },
};
const LIST_EXPECTED = { rep_a: ['P001', 'P002'], rep_b: ['P001', 'P003'], rep_c: [] };

test('WBS 2.5: multi-representative access and logout on the shared app with PostgreSQL', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const { default: pg } = await import('pg');
  const { createApp } = await import('../../src/app/app.js');
  const { migrate, seed } = await import('../../src/shared/db/migrations.js');
  const { SESSION_COOKIE_NAME, SESSION_TTL_MS } = await import('../../src/shared/config/session.config.js');
  const schema = `mq_access_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^mq_access_[a-f0-9]{32}$/);
  const config = { clientOrigin: 'http://localhost:5173', sessionSecret: 'test-only-secret-'.repeat(4),
    cookieSecure: false, noShowTimeoutSeconds: 60, sessionSchema: schema };
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let pool;
  let running;
  let schemaCreated = false;
  t.after(async () => {
    try {
      if (running?.server.listening) await new Promise((resolve) => running.server.close(resolve));
      if (running) await running.app.locals.sessionStore.close();
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

  const one = async (sql, params) => (await pool.query(sql, params)).rows[0];

  // DỮ LIỆU THỬ: rep_c (chưa có hồ sơ) dùng chung hash mật khẩu của rep_a; P004 không ai có quyền.
  await pool.query(`INSERT INTO users (user_id, username, display_name, password_hash, role)
    SELECT $1, 'rep_c', 'Đại diện chưa có hồ sơ', password_hash, 'REPRESENTATIVE' FROM users WHERE username = 'rep_a'`,
  [randomUUID()]);
  await pool.query(`INSERT INTO patient_profiles (code, display_name) VALUES ('P004', 'Người bệnh mô phỏng 04')`);
  const patient = {};
  for (const row of (await pool.query('SELECT patient_id, code FROM patient_profiles')).rows) patient[row.code] = row.patient_id;
  assert.deepEqual(Object.keys(patient).sort(), PROFILES);

  async function request(method, path, { cookie, json, headers: extra = {} } = {}) {
    const headers = { Origin: config.clientOrigin, ...extra };
    if (cookie) headers.Cookie = cookie;
    let body;
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    const response = await fetch(base + path, { method, headers, body });
    return { status: response.status, body: await response.json().catch(() => null),
      setCookie: response.headers.getSetCookie() };
  }
  async function login(username, { cookie } = {}) {
    const res = await request('POST', '/auth/login', { cookie, json: { username, password: 'Demo@12345' } });
    assert.equal(res.status, 200, `login ${username}`);
    return { cookie: res.setCookie[0].split(';')[0], setCookie: res.setCookie[0], body: res.body };
  }
  const sidOf = (cookie) => {
    const value = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
    return value.slice(2, value.lastIndexOf('.')); // "s:<sid>.<signature>"
  };
  const storedSession = (cookie) => one('SELECT sess, expire FROM auth_sessions WHERE sid = $1', [sidOf(cookie)]);
  const hasSession = async (cookie) => (await storedSession(cookie)) !== undefined;

  const jar = {};
  for (const who of ['staff_01', 'rep_a', 'rep_b', 'rep_c']) jar[who] = (await login(who)).cookie;
  const as = (who, method, path, json) => request(method, path, { cookie: who ? jar[who] : undefined, json });

  const opened = await as('staff_01', 'POST', '/sessions', {});
  assert.equal(opened.status, 201);
  const sessionId = opened.body.data.sessionId;
  const issueBody = (patientId) => ({ patientId, sessionId, requestId: randomUUID() });

  // Ảnh chụp CSDL: yêu cầu bị từ chối không được làm đổi phiếu, sự kiện, hồ sơ hay quyền.
  const snapshot = () => one(`SELECT
    (SELECT count(*)::int FROM tickets) AS tickets,
    (SELECT count(*)::int FROM ticket_events) AS events,
    (SELECT count(*)::int FROM patient_profiles) AS profiles,
    (SELECT count(*)::int FROM patient_access) AS grants,
    (SELECT coalesce(string_agg(ticket_id::text || ':' || status || ':' || updated_at::text, ',' ORDER BY ticket_id), '') FROM tickets) AS state`);
  async function denied(label, request_, status, code) {
    const before = await snapshot();
    const res = await request_();
    assert.equal(res.status, status, `${label}: status ${res.status}`);
    assert.equal(res.body?.error?.code, code, `${label}: code`);
    assert.equal(res.body?.data, undefined, `${label}: không trả dữ liệu`);
    assert.deepEqual(await snapshot(), before, `${label}: CSDL không đổi`);
  }
  // DỮ LIỆU THỬ: tạo/đóng phiếu bằng SQL để chuẩn bị tình huống; không phải đường đi nghiệp vụ.
  async function waitingTicketFor(code) {
    const existing = await one(`SELECT ticket_id FROM tickets WHERE session_id = $1 AND patient_id = $2
      AND status IN ('WAITING','CALLED','REGISTERING')`, [sessionId, patient[code]]);
    if (existing) return existing.ticket_id;
    const { last_issued_number: number } = await one(`UPDATE queue_sessions
      SET last_issued_number = last_issued_number + 1 WHERE session_id = $1 RETURNING last_issued_number`, [sessionId]);
    return (await one(`INSERT INTO tickets (session_id, patient_id, issued_by_user_id, request_id, number)
      VALUES ($1, $2, $3, $4, $5) RETURNING ticket_id`, [sessionId, patient[code], ID.staff, randomUUID(), number])).ticket_id;
  }
  const cancelAllActive = () => pool.query(`UPDATE tickets SET status = 'CANCELLED', updated_at = statement_timestamp()
    WHERE status IN ('WAITING','CALLED','REGISTERING')`);

  await t.test('MX-01 matrix: account × profile × operation (list, issue, active, view, cancel)', async () => {
    await cancelAllActive();
    // Danh sách hồ sơ theo từng tài khoản; hồ sơ dùng chung phải cùng một patientId.
    for (const [who, codes] of Object.entries(LIST_EXPECTED)) {
      const res = await as(who, 'GET', '/patients');
      assert.equal(res.status, 200, `${who} list`);
      assert.deepEqual(res.body.data.map((p) => p.code).sort(), codes, `${who} list codes`);
      for (const p of res.body.data) assert.equal(p.patientId, patient[p.code], `${who} ${p.code}: cùng patientId`);
    }

    for (const [who, row] of Object.entries(MATRIX)) {
      for (const code of PROFILES) {
        const label = `${who} × ${code}`;
        if (row[code] === 'ALLOW') {
          const issued = await as(who, 'POST', '/tickets', issueBody(patient[code]));
          assert.equal(issued.status, 201, `${label} issue`);
          assert.equal(issued.body.data.ticket.patientId, patient[code], `${label} issue: đúng hồ sơ`);
          const ticketId = issued.body.data.ticket.ticketId;
          const active = await as(who, 'GET', `/tickets/active?patientId=${patient[code]}&sessionId=${sessionId}`);
          assert.equal(active.status, 200, `${label} active`);
          assert.equal(active.body.data.ticket.ticketId, ticketId, `${label} active: đúng phiếu`);
          const view = await as(who, 'GET', `/tickets/${ticketId}`);
          assert.equal(view.status, 200, `${label} view`);
          assert.equal(view.body.data.ticket.ticketId, ticketId, `${label} view: đúng phiếu`);
          const cancelled = await as(who, 'POST', `/tickets/${ticketId}/cancel`);
          assert.equal(cancelled.status, 200, `${label} cancel`);
          assert.equal(cancelled.body.data.ticket.status, 'CANCELLED', `${label} cancel: trạng thái`);
        } else {
          const ticketId = await waitingTicketFor(code);
          await denied(`${label} issue`, () => as(who, 'POST', '/tickets', issueBody(patient[code])), 403, 'FORBIDDEN');
          await denied(`${label} active`, () => as(who, 'GET', `/tickets/active?patientId=${patient[code]}&sessionId=${sessionId}`), 403, 'FORBIDDEN');
          await denied(`${label} view`, () => as(who, 'GET', `/tickets/${ticketId}`), 403, 'FORBIDDEN');
          await denied(`${label} cancel`, () => as(who, 'POST', `/tickets/${ticketId}/cancel`), 403, 'FORBIDDEN');
          assert.equal((await one('SELECT status FROM tickets WHERE ticket_id = $1', [ticketId])).status, 'WAITING', `${label}: phiếu không đổi`);
          await cancelAllActive();
        }
      }
    }

    // STAFF không dùng API hồ sơ/phiếu riêng; người chưa đăng nhập bị chặn từ cổng đầu.
    for (const code of PROFILES) {
      const ticketId = await waitingTicketFor(code);
      await denied(`staff list`, () => as('staff_01', 'GET', '/patients'), 403, 'FORBIDDEN');
      await denied(`staff × ${code} issue`, () => as('staff_01', 'POST', '/tickets', issueBody(patient[code])), 403, 'FORBIDDEN');
      await denied(`staff × ${code} active`, () => as('staff_01', 'GET', `/tickets/active?patientId=${patient[code]}&sessionId=${sessionId}`), 403, 'FORBIDDEN');
      await denied(`staff × ${code} view`, () => as('staff_01', 'GET', `/tickets/${ticketId}`), 403, 'FORBIDDEN');
      await denied(`staff × ${code} cancel`, () => as('staff_01', 'POST', `/tickets/${ticketId}/cancel`), 403, 'FORBIDDEN');
      await denied(`anon list`, () => as(null, 'GET', '/patients'), 401, 'UNAUTHENTICATED');
      await denied(`anon × ${code} issue`, () => as(null, 'POST', '/tickets', issueBody(patient[code])), 401, 'UNAUTHENTICATED');
      await denied(`anon × ${code} view`, () => as(null, 'GET', `/tickets/${ticketId}`), 401, 'UNAUTHENTICATED');
      await denied(`anon × ${code} cancel`, () => as(null, 'POST', `/tickets/${ticketId}/cancel`), 401, 'UNAUTHENTICATED');
      await cancelAllActive();
    }

    // Vận hành quầy chỉ STAFF; bảng công khai ai cũng đọc nhưng không lộ dữ liệu hồ sơ.
    for (const path of [`/queue/waiting?sessionId=${sessionId}`, `/queue/current?sessionId=${sessionId}`]) {
      assert.equal((await as('staff_01', 'GET', path)).status, 200, `staff ${path}`);
      for (const who of ['rep_a', 'rep_b', 'rep_c']) await denied(`${who} ${path}`, () => as(who, 'GET', path), 403, 'FORBIDDEN');
      await denied(`anon ${path}`, () => as(null, 'GET', path), 401, 'UNAUTHENTICATED');
    }
    await waitingTicketFor('P002');
    for (const who of [null, 'staff_01', 'rep_a', 'rep_b', 'rep_c']) {
      const board = await as(who, 'GET', '/public/board');
      assert.equal(board.status, 200, `board ${who ?? 'anon'}`);
      const text = JSON.stringify(board.body);
      for (const secret of [...Object.values(patient), ...PROFILES, 'Người bệnh mô phỏng', ID.repA, ID.repB]) {
        assert.equal(text.includes(secret), false, `board ${who ?? 'anon'}: không lộ ${secret}`);
      }
    }
    await cancelAllActive();
  });

  await t.test('MX-02 two representatives of the same profile: rights follow the patient, not who issued', async () => {
    await cancelAllActive();
    const profilesBefore = (await snapshot()).profiles;
    const p1Before = (await one('SELECT count(*)::int AS n FROM tickets WHERE session_id = $1 AND patient_id = $2', [sessionId, patient.P001])).n;
    for (const [issuer, other] of [['rep_a', 'rep_b'], ['rep_b', 'rep_a']]) {
      const issued = await as(issuer, 'POST', '/tickets', issueBody(patient.P001));
      assert.equal(issued.status, 201);
      const ticket = issued.body.data.ticket;
      const seen = await as(other, 'GET', `/tickets/active?patientId=${patient.P001}&sessionId=${sessionId}`);
      assert.equal(seen.status, 200);
      assert.deepEqual(seen.body.data.ticket, ticket, `${other} thấy đúng phiếu do ${issuer} lấy`);
      const viewed = await as(other, 'GET', `/tickets/${ticket.ticketId}`);
      assert.equal(viewed.status, 200);
      assert.equal(viewed.body.data.ticket.patientId, patient.P001);
      const again = await as(other, 'POST', '/tickets', issueBody(patient.P001));
      assert.equal(again.status, 409);
      assert.equal(again.body.error.code, 'ACTIVE_TICKET_EXISTS');
      assert.deepEqual(again.body.error.details, { ticketId: ticket.ticketId });
      const cancelled = await as(other, 'POST', `/tickets/${ticket.ticketId}/cancel`);
      assert.equal(cancelled.status, 200);
      assert.equal(cancelled.body.data.ticket.ticketId, ticket.ticketId);
      const row = await one(`SELECT t.issued_by_user_id, t.patient_id, u.username AS canceller FROM tickets t
        JOIN ticket_events e ON e.ticket_id = t.ticket_id AND e.action = 'CANCELLED'
        JOIN users u ON u.user_id = e.actor_user_id WHERE t.ticket_id = $1`, [ticket.ticketId]);
      assert.equal(row.canceller, other, 'sự kiện CANCELLED ghi người thật sự hủy');
      assert.equal(row.patient_id, patient.P001);
      assert.equal(row.issued_by_user_id, issuer === 'rep_a' ? ID.repA : ID.repB, 'người lấy số không đổi');
    }
    const count = await one('SELECT count(*)::int AS n FROM tickets WHERE session_id = $1 AND patient_id = $2', [sessionId, patient.P001]);
    assert.equal(count.n - p1Before, 2, 'đúng hai phiếu mới cho hai vòng, không phiếu thừa');
    assert.equal((await snapshot()).profiles, profilesBefore, 'không tạo danh tính hồ sơ mới');
  });

  await t.test('MX-03 swapping ticketId, patientId or extra fields for data outside the grant changes nothing', async () => {
    await cancelAllActive();
    const issued = await as('rep_a', 'POST', '/tickets', issueBody(patient.P002));
    assert.equal(issued.status, 201);
    const foreign = issued.body.data.ticket.ticketId; // chỉ rep_a có quyền
    const own = (await as('rep_b', 'POST', '/tickets', issueBody(patient.P003))).body.data.ticket.ticketId;

    await denied('rep_b xem phiếu của P002', () => as('rep_b', 'GET', `/tickets/${foreign}`), 403, 'FORBIDDEN');
    await denied('rep_b hủy phiếu của P002', () => as('rep_b', 'POST', `/tickets/${foreign}/cancel`), 403, 'FORBIDDEN');
    await denied('rep_b lấy số với patientId của P002', () => as('rep_b', 'POST', '/tickets', issueBody(patient.P002)), 403, 'FORBIDDEN');
    await denied('rep_b hỏi phiếu hoạt động của P002',
      () => as('rep_b', 'GET', `/tickets/active?patientId=${patient.P002}&sessionId=${sessionId}`), 403, 'FORBIDDEN');
    await denied('rep_b thêm ticketId lạ vào truy vấn phiếu hoạt động',
      () => as('rep_b', 'GET', `/tickets/active?patientId=${patient.P003}&sessionId=${sessionId}&ticketId=${foreign}`), 400, 'VALIDATION_ERROR');
    await denied('rep_b thêm userId/issuedBy vào thân yêu cầu',
      () => as('rep_b', 'POST', '/tickets', { ...issueBody(patient.P003), userId: ID.repA, issuedBy: ID.repA }), 400, 'VALIDATION_ERROR');
    await denied('rep_b hủy kèm thân yêu cầu giả patientId', () => as('rep_b', 'POST', `/tickets/${own}/cancel`, { patientId: patient.P002 }), 400, 'VALIDATION_ERROR');
    await denied('ticketId không tồn tại', () => as('rep_b', 'GET', `/tickets/${randomUUID()}`), 404, 'NOT_FOUND');
    await denied('ticketId sai định dạng', () => as('rep_b', 'GET', '/tickets/not-a-uuid'), 400, 'VALIDATION_ERROR');
    await denied('hủy phiếu không tồn tại', () => as('rep_b', 'POST', `/tickets/${randomUUID()}/cancel`), 404, 'NOT_FOUND');

    // Phiếu của P002 và P003 vẫn nguyên trạng, và mỗi chủ vẫn dùng được phiếu của mình.
    const states = await pool.query('SELECT ticket_id, status FROM tickets WHERE ticket_id = ANY($1) ORDER BY ticket_id', [[foreign, own]]);
    assert.ok(states.rows.every((r) => r.status === 'WAITING'));
    assert.equal((await as('rep_a', 'GET', `/tickets/${foreign}`)).status, 200);
    assert.equal((await as('rep_b', 'GET', `/tickets/${own}`)).status, 200);
    await cancelAllActive();
  });

  await t.test('LO-01 logout destroys the server session, clears the cookie and the old cookie gets 401', async () => {
    await cancelAllActive();
    for (const who of ['rep_a', 'staff_01']) {
      const { cookie } = await login(who);
      assert.equal((await request('GET', '/auth/me', { cookie })).status, 200, `${who} /auth/me trước khi đăng xuất`);
      assert.equal(await hasSession(cookie), true, `${who}: có bản ghi phiên trong store`);

      const before = await snapshot();
      const out = await request('POST', '/auth/logout', { cookie });
      assert.equal(out.status, 200, `${who} logout`);
      assert.deepEqual(out.body, { data: null });
      assert.match(out.setCookie[0], new RegExp(`^${SESSION_COOKIE_NAME}=;`), 'cookie bị xóa');
      assert.match(out.setCookie[0], /Expires=Thu, 01 Jan 1970/);
      assert.equal(await hasSession(cookie), false, `${who}: bản ghi phiên đã bị hủy phía server`);
      assert.deepEqual(await snapshot(), before, 'đăng xuất không đổi dữ liệu nghiệp vụ');

      // Cookie cũ (kể cả đã bị sao chép) không còn dùng được ở bất kỳ API riêng nào.
      const replays = [['GET', '/auth/me'], ['GET', '/patients'], ['GET', '/sessions/current'], ['GET', '/queue/waiting'],
        ['GET', `/tickets/active?patientId=${patient.P001}&sessionId=${sessionId}`], ['POST', '/tickets', issueBody(patient.P001)],
        ['POST', `/tickets/${randomUUID()}/cancel`], ['POST', '/auth/logout']];
      for (const [method, path, json] of replays) {
        const res = await request(method, path, { cookie, json });
        assert.equal(res.status, 401, `${who} ${method} ${path} bằng cookie cũ`);
        assert.equal(res.body.error.code, 'UNAUTHENTICATED');
        assert.equal(res.body.data, undefined);
      }
    }
  });

  await t.test('LO-02 logout needs a session and takes no body; a bad request keeps the session alive', async () => {
    assert.equal((await request('POST', '/auth/logout')).status, 401, 'không cookie');
    assert.equal((await request('POST', '/auth/logout', { cookie: `${SESSION_COOKIE_NAME}=s%3Aforged.garbage` })).status, 401, 'cookie giả');
    assert.equal((await request('POST', '/auth/logout', { json: {} })).status, 401, 'chưa đăng nhập: 401 trước 400');
    const { cookie } = await login('rep_b');
    const bad = await request('POST', '/auth/logout', { cookie, json: { all: true } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'VALIDATION_ERROR');
    assert.equal(await hasSession(cookie), true, 'yêu cầu sai không làm mất phiên');
    assert.equal((await request('GET', '/auth/me', { cookie })).status, 200);
    assert.equal((await request('POST', '/auth/logout', { cookie })).status, 200);
  });

  await t.test('LO-03 logout only ends the caller\'s own session; other users and other browsers stay signed in', async () => {
    const a1 = (await login('rep_a')).cookie;
    const a2 = (await login('rep_a')).cookie; // cùng tài khoản, trình duyệt khác
    const b1 = (await login('rep_b')).cookie;
    assert.notEqual(sidOf(a1), sidOf(a2));
    assert.equal((await request('POST', '/auth/logout', { cookie: a1 })).status, 200);
    assert.equal((await request('GET', '/auth/me', { cookie: a1 })).status, 401);
    assert.equal((await request('GET', '/auth/me', { cookie: a2 })).status, 200, 'phiên khác của cùng tài khoản không bị hủy');
    assert.equal((await request('GET', '/auth/me', { cookie: b1 })).status, 200, 'tài khoản khác không bị ảnh hưởng');
    await request('POST', '/auth/logout', { cookie: a2 });
    await request('POST', '/auth/logout', { cookie: b1 });
  });

  await t.test('LO-04 new login after logout gets a NEW session id; the old one stays dead', async () => {
    const first = (await login('rep_a')).cookie;
    await request('POST', '/auth/logout', { cookie: first });
    const second = (await login('rep_a')).cookie;
    assert.notEqual(sidOf(first), sidOf(second));
    assert.equal((await request('GET', '/auth/me', { cookie: first })).status, 401);
    assert.equal((await request('GET', '/auth/me', { cookie: second })).status, 200);
    await request('POST', '/auth/logout', { cookie: second });
  });

  await t.test('SW-01 switching account in the same browser keeps nothing of the previous account', async () => {
    await cancelAllActive();
    const privateA = (await as('rep_a', 'POST', '/tickets', issueBody(patient.P002))).body.data.ticket.ticketId;
    const browser = (await login('rep_a')).cookie; // trình duyệt đang giữ phiên của rep_a
    assert.equal((await request('GET', '/patients', { cookie: browser })).body.data.length, 2);

    // Đăng nhập tài khoản khác khi cookie cũ vẫn còn: phải có phiên mới, phiên cũ bị hủy.
    const switched = await login('rep_b', { cookie: browser });
    assert.notEqual(sidOf(switched.cookie), sidOf(browser));
    assert.equal(await hasSession(browser), false, 'phiên của rep_a đã bị hủy phía server');
    assert.equal((await request('GET', '/auth/me', { cookie: browser })).status, 401);
    const me = await request('GET', '/auth/me', { cookie: switched.cookie });
    assert.equal(me.body.data.userId, ID.repB);
    const list = await request('GET', '/patients', { cookie: switched.cookie });
    assert.deepEqual(list.body.data.map((p) => p.code).sort(), ['P001', 'P003'], 'không thấy P002 của rep_a');
    await denied('phiên mới không đọc được phiếu riêng của rep_a', () => request('GET', `/tickets/${privateA}`, { cookie: switched.cookie }), 403, 'FORBIDDEN');
    await denied('phiên mới không hủy được phiếu riêng của rep_a', () => request('POST', `/tickets/${privateA}/cancel`, { cookie: switched.cookie }), 403, 'FORBIDDEN');

    // Phiên mới chỉ chứa định danh mới, không mang trạng thái nào từ phiên cũ.
    const stored = await storedSession(switched.cookie);
    assert.deepEqual(Object.keys(stored.sess).sort(), ['cookie', 'expiresAt', 'userId']);
    assert.equal(stored.sess.userId, ID.repB);
    await request('POST', '/auth/logout', { cookie: switched.cookie });
    await cancelAllActive();
  });

  await t.test('EX-01 absolute 8h expiry is fixed at login, never extended by activity, and expired sessions are destroyed', async () => {
    const t0 = Date.now();
    const { cookie, setCookie, body } = await login('rep_a');
    const t1 = Date.now();
    const expiresAt = Date.parse(body.data.expiresAt);
    assert.ok(expiresAt - SESSION_TTL_MS >= t0 - 1 && expiresAt - SESSION_TTL_MS <= t1 + 1, 'hết hạn = lúc đăng nhập + 8 giờ');
    assert.ok(Math.abs(Date.parse(/Expires=([^;]+)/.exec(setCookie)[1]) - expiresAt) < 1000, 'cookie hết hạn cùng lúc với phiên');

    const first = await storedSession(cookie);
    for (let i = 0; i < 3; i += 1) assert.equal((await request('GET', '/patients', { cookie })).status, 200);
    const later = await storedSession(cookie);
    assert.equal(later.sess.expiresAt, first.sess.expiresAt, 'hoạt động không gia hạn expiresAt');
    assert.equal(later.expire.getTime(), first.expire.getTime(), 'hoạt động không gia hạn bản ghi trong store');

    // Thời gian kiểm soát được: lùi expiresAt về quá khứ thay vì chờ 8 giờ.
    await pool.query(`UPDATE auth_sessions SET sess = jsonb_set(sess::jsonb, '{expiresAt}', to_jsonb($2::text))::json WHERE sid = $1`,
      [sidOf(cookie), new Date(Date.now() - 1000).toISOString()]);
    const res = await request('GET', '/patients', { cookie });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    assert.equal(await hasSession(cookie), false, 'phiên hết hạn bị xóa khỏi store');

    // Phiên hết hạn không thể "đăng xuất" để thành công, và đăng nhập lại cho hạn 8 giờ mới.
    const stale = (await login('rep_b')).cookie;
    await pool.query(`UPDATE auth_sessions SET sess = jsonb_set(sess::jsonb, '{expiresAt}', to_jsonb($2::text))::json WHERE sid = $1`,
      [sidOf(stale), new Date(Date.now() - 1000).toISOString()]);
    assert.equal((await request('POST', '/auth/logout', { cookie: stale })).status, 401);
    const fresh = await login('rep_b');
    assert.ok(Date.parse(fresh.body.data.expiresAt) > Date.now() + SESSION_TTL_MS - 60_000);
    await request('POST', '/auth/logout', { cookie: fresh.cookie });
  });
});
