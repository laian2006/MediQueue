import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createAuthRepository } from '../../src/modules/auth/auth.repository.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createPatientAccessRepository } from '../../src/modules/patients/patient-access.repository.js';
import { createPatientAccessService } from '../../src/modules/patients/patient-access.service.js';
import { createAuthenticate } from '../../src/shared/middleware/authenticate.js';
import { requireStaff } from '../../src/shared/middleware/require-staff.js';
import { SESSION_COOKIE_NAME, SESSION_TTL_MS, sessionCookieOptions } from '../../src/shared/config/session.config.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const IDS = {
  staff: '00000000-0000-4000-8000-000000000001',
  repA: '00000000-0000-4000-8000-000000000002',
  repB: '00000000-0000-4000-8000-000000000003',
  p1: '10000000-0000-4000-8000-000000000001',
  p2: '10000000-0000-4000-8000-000000000002',
  p3: '10000000-0000-4000-8000-000000000003',
};
const PASSWORD = 'Demo@12345';

// No database URL means an explicit skip, never a claimed integration pass.
test('WBS 1.4: identity schema, seed, login and permissions on Express + PostgreSQL', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const { default: express } = await import('express');
  const { default: session } = await import('express-session');
  const { default: pg } = await import('pg');
  const schema = `mq_identity_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^mq_identity_test_[a-f0-9]{32}$/);
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let pool;
  const servers = [];
  let schemaCreated = false;
  t.after(async () => {
    try {
      for (const server of servers) {
        if (server.listening) await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
      }
      if (pool) await pool.end();
      if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await admin.end();
    }
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public`, max: 10 });

  // Đúng thứ tự thật: 001 → seed → 002.
  await pool.query(await read('../../../database/migrations/001_identity.sql'));
  await pool.query(await read('../../../database/seeds/001_identity.sql'));
  await pool.query(await read('../../../database/migrations/002_sessions.sql'));

  const authRepository = createAuthRepository(pool);
  const accessService = createPatientAccessService({ repository: createPatientAccessRepository(pool) });
  const rejectsWith = async (promise, code) => assert.rejects(promise, (error) => error.code === code);

  await t.test('seed: 1 STAFF, 2 REPRESENTATIVE, one shared profile, one private profile each', async () => {
    const users = (await pool.query('SELECT username, role FROM users ORDER BY username')).rows;
    assert.deepEqual(users, [
      { username: 'rep_a', role: 'REPRESENTATIVE' }, { username: 'rep_b', role: 'REPRESENTATIVE' },
      { username: 'staff_01', role: 'STAFF' },
    ]);
    const access = (await pool.query(`SELECT u.username, p.code FROM patient_access a
      JOIN users u USING (user_id) JOIN patient_profiles p USING (patient_id) ORDER BY 1, 2`)).rows;
    assert.deepEqual(access.map((r) => `${r.username}:${r.code}`), ['rep_a:P001', 'rep_a:P002', 'rep_b:P001', 'rep_b:P003']);
    // Hồ sơ chung: một patient_id duy nhất, không có hai bản sao người bệnh.
    const shared = (await pool.query(`SELECT patient_id, count(*) FROM patient_access GROUP BY patient_id HAVING count(*) > 1`)).rows;
    assert.deepEqual(shared.map((r) => r.patient_id), [IDS.p1]);
    assert.equal(Number((await pool.query(`SELECT count(*) FROM users WHERE password_hash LIKE '%${PASSWORD}%'`)).rows[0].count), 0);
  });

  await t.test('seed can be re-run without duplicates', async () => {
    await pool.query(await read('../../../database/seeds/001_identity.sql'));
    const counts = (await pool.query(`SELECT (SELECT count(*) FROM users) u, (SELECT count(*) FROM patient_profiles) p,
      (SELECT count(*) FROM patient_access) a`)).rows[0];
    assert.deepEqual([counts.u, counts.p, counts.a].map(Number), [3, 3, 4]);
  });

  await t.test('constraints reject bad identity data', async () => {
    const hash = 'scrypt$x';
    await rejectsWith(pool.query(`INSERT INTO users (username, display_name, password_hash, role) VALUES ('rep_a','D','${hash}','REPRESENTATIVE')`), '23505');
    await rejectsWith(pool.query(`INSERT INTO users (username, display_name, password_hash, role) VALUES ('x1','D','${hash}','ADMIN')`), '23514');
    await rejectsWith(pool.query(`INSERT INTO users (username, display_name, password_hash, role) VALUES ('  ','D','${hash}','STAFF')`), '23514');
    await rejectsWith(pool.query(`INSERT INTO users (username, display_name, password_hash, role) VALUES ('x2','D','','STAFF')`), '23514');
    await rejectsWith(pool.query(`INSERT INTO patient_profiles (code, display_name) VALUES ('P001','Trùng mã')`), '23505');
    await rejectsWith(pool.query(`INSERT INTO patient_access (user_id, patient_id) VALUES ('${IDS.repA}','${IDS.p1}')`), '23505');
    await rejectsWith(pool.query(`INSERT INTO patient_access (user_id, patient_id) VALUES ('${randomUUID()}','${IDS.p1}')`), '23503');
    await rejectsWith(pool.query(`INSERT INTO patient_access (user_id, patient_id) VALUES ('${IDS.repA}','${randomUUID()}')`), '23503');
  });

  await t.test('002_sessions applies on top of 001: opened_by must be a real user', async () => {
    await rejectsWith(pool.query(`INSERT INTO queue_sessions (opened_by) VALUES ('${randomUUID()}')`), '23503');
    await pool.query(`INSERT INTO queue_sessions (opened_by) VALUES ('${IDS.staff}')`);
    await pool.query('DELETE FROM queue_sessions');
  });

  await t.test('repositories: lookups are parameterized and shaped correctly', async () => {
    assert.equal((await authRepository.findByUsername('rep_a')).user_id, IDS.repA);
    assert.equal(await authRepository.findByUsername("rep_a' OR '1'='1"), null);
    assert.equal(await authRepository.findByUsername('REP_A'), null);
    assert.equal((await authRepository.findById(IDS.staff)).role, 'STAFF');
    assert.equal(await authRepository.findById(randomUUID()), null);
  });

  await t.test('patient access: each representative sees exactly their profiles; staff none', async () => {
    const codes = async (userId, role = 'REPRESENTATIVE') => (await accessService.listPatients({ userId, role })).map((p) => p.code);
    assert.deepEqual(await codes(IDS.repA), ['P001', 'P002']);
    assert.deepEqual(await codes(IDS.repB), ['P001', 'P003']);
    const shapes = await accessService.listPatients({ userId: IDS.repA, role: 'REPRESENTATIVE' });
    assert.deepEqual(Object.keys(shapes[0]).sort(), ['code', 'displayName', 'patientId']);
    assert.equal(shapes[0].patientId, IDS.p1);
    await assert.rejects(accessService.listPatients({ userId: IDS.staff, role: 'STAFF' }), (e) => e.statusCode === 403);
    assert.equal(await accessService.canAccessPatient({ userId: IDS.repA, role: 'REPRESENTATIVE' }, IDS.p3), false);
    assert.equal(await accessService.canAccessPatient({ userId: IDS.repB, role: 'REPRESENTATIVE' }, IDS.p1), true);
  });

  // ---------- HTTP: login, cookie, middleware ----------
  const { createAuthRouter } = await import('../../src/modules/auth/auth.routes.js');

  function makeApp(now = () => new Date()) {
    const app = express();
    app.use(express.json());
    app.use(session({
      name: SESSION_COOKIE_NAME, secret: 'test-only-secret-test-only-secret-1234',
      resave: false, saveUninitialized: false, cookie: sessionCookieOptions(),
    }));
    const authenticate = createAuthenticate({ userRepository: authRepository, now });
    const authService = createAuthService({ repository: authRepository, now });
    app.use('/api/v1/auth', createAuthRouter({ authService, authenticate }));
    app.get('/api/v1/probe/staff', authenticate, requireStaff, (_req, res) => res.json({ data: 'ok' }));
    app.get('/api/v1/probe/patients/:patientId', authenticate, async (req, res, next) => {
      try {
        await accessService.assertCanAccessPatient(req.user, req.params.patientId);
        res.json({ data: 'ok' });
      } catch (error) {
        if (error.statusCode) return res.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
        next(error);
      }
    });
    app.use((error, _req, res, _next) => {
      const badJson = error.type === 'entity.parse.failed';
      res.status(badJson ? 400 : 500).json({ error: { code: badJson ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message: 'error' } });
    });
    return app;
  }

  async function start(app) {
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}/api/v1`;
  }
  const cookieOf = (response) => (response.headers.getSetCookie()[0] ?? '').split(';')[0];
  async function call(base, method, path, { cookie, body, headers = {}, raw } = {}) {
    const h = { ...headers };
    if (cookie) h.cookie = cookie;
    let payload;
    if (raw !== undefined) { h['content-type'] = raw.type; payload = raw.text; }
    else if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const response = await fetch(base + path, { method, headers: h, body: payload });
    return { status: response.status, body: await response.json(), response };
  }
  const login = (base, username, password = PASSWORD, cookie) => call(base, 'POST', '/auth/login', { body: { username, password }, cookie });

  const base = await start(makeApp());

  await t.test('login success: user + expiresAt, HttpOnly/SameSite=Lax cookie with 8h absolute expiry, no secrets', async () => {
    const before = Date.now();
    const out = await login(base, 'rep_a');
    assert.equal(out.status, 200);
    assert.deepEqual(out.body.data.user, { userId: IDS.repA, displayName: 'Người đại diện A', role: 'REPRESENTATIVE' });
    const expires = Date.parse(out.body.data.expiresAt);
    assert.ok(Math.abs(expires - (before + SESSION_TTL_MS)) < 5000);
    const setCookie = out.response.headers.getSetCookie()[0];
    assert.ok(setCookie.startsWith(`${SESSION_COOKIE_NAME}=`));
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.doesNotMatch(setCookie, /;\s*Secure/i);
    assert.ok(Math.abs(Date.parse(/Expires=([^;]+)/i.exec(setCookie)[1]) - expires) < 2000);
    assert.equal(out.response.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(JSON.stringify(out.body), /password|hash|scrypt|username/i);
  });

  await t.test('GET /auth/me identifies the sender; no or fake cookie → 401', async () => {
    const cookie = cookieOf((await login(base, 'staff_01')).response);
    const me = await call(base, 'GET', '/auth/me', { cookie });
    assert.equal(me.status, 200);
    assert.deepEqual(me.body.data, { userId: IDS.staff, displayName: 'Nhân viên quầy 01', role: 'STAFF' });
    assert.equal((await call(base, 'GET', '/auth/me')).status, 401);
    assert.equal((await call(base, 'GET', '/auth/me', { cookie: `${SESSION_COOKIE_NAME}=s%3Aforged.sig` })).status, 401);
  });

  await t.test('wrong password and unknown user: identical 401, no cookie, no login state', async () => {
    const wrong = await login(base, 'rep_a', 'sai-mat-khau');
    const unknown = await login(base, 'khong_ton_tai');
    for (const out of [wrong, unknown]) {
      assert.equal(out.status, 401);
      assert.equal(out.body.error.code, 'INVALID_CREDENTIALS');
      assert.equal(out.response.headers.getSetCookie().length, 0);
    }
    assert.equal(wrong.body.error.message, unknown.body.error.message);
  });

  await t.test('invalid login bodies are 400', async () => {
    assert.equal((await call(base, 'POST', '/auth/login', { body: {} })).status, 400);
    assert.equal((await call(base, 'POST', '/auth/login', { body: { username: 'rep_a' } })).status, 400);
    assert.equal((await call(base, 'POST', '/auth/login', { body: { username: 'rep_a', password: PASSWORD, role: 'STAFF' } })).status, 400);
    assert.equal((await call(base, 'POST', '/auth/login', { body: [] })).status, 400);
    assert.equal((await call(base, 'POST', '/auth/login', { raw: { type: 'text/plain', text: 'username=rep_a' } })).status, 400);
    assert.equal((await call(base, 'POST', '/auth/login', { raw: { type: 'application/json', text: '{broken' } })).status, 400);
  });

  await t.test('role checks: only STAFF passes requireStaff; role/userId spoofing changes nothing', async () => {
    const staffCookie = cookieOf((await login(base, 'staff_01')).response);
    const repCookie = cookieOf((await login(base, 'rep_a')).response);
    assert.equal((await call(base, 'GET', '/probe/staff', { cookie: staffCookie })).status, 200);
    const denied = await call(base, 'GET', '/probe/staff', { cookie: repCookie,
      headers: { 'x-user-role': 'STAFF', 'x-test-actor': 'staff' } });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, 'FORBIDDEN');
    assert.equal((await call(base, 'GET', '/probe/staff')).status, 401);
    const spoof = await call(base, 'GET', '/auth/me', { cookie: repCookie, headers: { 'x-user-id': IDS.staff } });
    assert.equal(spoof.body.data.userId, IDS.repA);
  });

  await t.test('patient access over HTTP: own and shared profiles allowed, others 403, staff 403, bad id 400', async () => {
    const aCookie = cookieOf((await login(base, 'rep_a')).response);
    const bCookie = cookieOf((await login(base, 'rep_b')).response);
    const staffCookie = cookieOf((await login(base, 'staff_01')).response);
    const status = async (cookie, id) => (await call(base, 'GET', `/probe/patients/${id}`, { cookie })).status;
    assert.equal(await status(aCookie, IDS.p1), 200);
    assert.equal(await status(bCookie, IDS.p1), 200);
    assert.equal(await status(aCookie, IDS.p2), 200);
    assert.equal(await status(aCookie, IDS.p3), 403);
    assert.equal(await status(bCookie, IDS.p2), 403);
    assert.equal(await status(aCookie, randomUUID()), 403);
    assert.equal(await status(staffCookie, IDS.p1), 403);
    assert.equal(await status(aCookie, 'not-a-uuid'), 400);
    assert.equal(await status(undefined, IDS.p1), 401);
  });

  await t.test('login issues a NEW session id; the old cookie stops working (session fixation)', async () => {
    const first = cookieOf((await login(base, 'rep_a')).response);
    const second = cookieOf((await login(base, 'rep_a', PASSWORD, first)).response);
    assert.notEqual(first, second);
    assert.equal((await call(base, 'GET', '/auth/me', { cookie: first })).status, 401);
    assert.equal((await call(base, 'GET', '/auth/me', { cookie: second })).status, 200);
  });

  await t.test('absolute 8h expiry: the same cookie is rejected once the clock passes expiresAt', async () => {
    const cookie = cookieOf((await login(base, 'rep_a')).response);
    let offset = 0;
    const lateBase = await start(makeApp(() => new Date(Date.now() + offset)));
    // App mới có MemoryStore riêng (cookie ở app khác không có hiệu lực), nên đăng nhập lại rồi dịch đồng hồ.
    const fresh = cookieOf((await login(lateBase, 'rep_a')).response);
    assert.equal((await call(lateBase, 'GET', '/auth/me', { cookie: fresh })).status, 200);
    offset = SESSION_TTL_MS - 60_000;
    assert.equal((await call(lateBase, 'GET', '/auth/me', { cookie: fresh })).status, 200);
    offset = SESSION_TTL_MS + 60_000;
    const expired = await call(lateBase, 'GET', '/auth/me', { cookie: fresh });
    assert.equal(expired.status, 401);
    assert.equal(expired.body.error.code, 'UNAUTHENTICATED');
    assert.equal((await call(lateBase, 'GET', '/auth/me', { cookie })).status, 401);
  });

  await t.test('a user removed after login loses access on the next request', async () => {
    const tmpId = randomUUID();
    await pool.query(`INSERT INTO users (user_id, username, display_name, password_hash, role)
      SELECT $1, 'tmp_user', 'Tạm', password_hash, 'REPRESENTATIVE' FROM users WHERE username = 'rep_a'`, [tmpId]);
    const cookie = cookieOf((await login(base, 'tmp_user')).response);
    assert.equal((await call(base, 'GET', '/auth/me', { cookie })).status, 200);
    await pool.query('DELETE FROM users WHERE user_id = $1', [tmpId]);
    assert.equal((await call(base, 'GET', '/auth/me', { cookie })).status, 401);
  });
});
