import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pg from 'pg';
import { createApp } from '../../src/app/app.js';
import { migrate, seed } from '../../src/shared/db/migrations.js';
import { createPatientAccessRepository } from '../../src/modules/patients/patient-access.repository.js';
import { createPatientAccessService } from '../../src/modules/patients/patient-access.service.js';

const migrations = fileURLToPath(new URL('../../../database/migrations/', import.meta.url));
const seeds = fileURLToPath(new URL('../../../database/seeds/', import.meta.url));
const P = {
  P001: '10000000-0000-4000-8000-000000000001',
  P002: '10000000-0000-4000-8000-000000000002',
  P003: '10000000-0000-4000-8000-000000000003',
};

// Không có TEST_DATABASE_URL thì ghi SKIP, không được báo là đã pass.
test('WBS 1.5: GET /patients on the real app, real cookie login and PostgreSQL', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const schema = `mq_patients_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^mq_patients_test_[a-f0-9]{32}$/);
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const config = { clientOrigin: 'http://localhost:5173', sessionSecret: 'test-only-secret-'.repeat(4), cookieSecure: false, noShowTimeoutSeconds: 60, sessionSchema: schema };
  let pool;
  let app;
  let server;
  t.after(async () => {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    if (app) await app.locals.sessionStore.close();
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
  await migrate(pool, migrations);
  await seed(pool, seeds);
  // Người đại diện chưa được cấp hồ sơ nào: dùng chung hash của rep_a (mật khẩu Demo@12345).
  await pool.query(
    `INSERT INTO users (user_id, username, display_name, password_hash, role)
     SELECT $1, 'rep_empty', 'Đại diện chưa có hồ sơ', password_hash, 'REPRESENTATIVE' FROM users WHERE username = 'rep_a'`,
    [randomUUID()],
  );

  app = createApp({ pool, config });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/v1`;
  const login = async (username, password = 'Demo@12345') => fetch(`${url}/auth/login`, {
    method: 'POST',
    headers: { Origin: config.clientOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const cookieOf = async (username) => (await login(username)).headers.get('set-cookie').split(';')[0];
  const list = (cookie) => fetch(`${url}/patients`, { headers: cookie ? { Cookie: cookie } : {} });

  await t.test('rep_a sees P001 (shared) and P002 only, with exactly the DTO fields', async () => {
    const response = await list(await cookieOf('rep_a'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const { data } = await response.json();
    assert.deepEqual(data.map((p) => p.code), ['P001', 'P002']);
    assert.deepEqual(data.map((p) => p.patientId), [P.P001, P.P002]);
    for (const patient of data) assert.deepEqual(Object.keys(patient).sort(), ['code', 'displayName', 'patientId']);
  });

  await t.test('rep_b sees P001 (the same patientId) and P003 only', async () => {
    const { data } = await (await list(await cookieOf('rep_b'))).json();
    assert.deepEqual(data.map((p) => p.patientId), [P.P001, P.P003]);
  });

  await t.test('a representative with no granted profile gets 200 and an empty list', async () => {
    const response = await list(await cookieOf('rep_empty'));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { data: [] });
  });

  await t.test('STAFF is 403; no cookie and a fake cookie are 401', async () => {
    const staff = await list(await cookieOf('staff_01'));
    assert.equal(staff.status, 403);
    assert.equal((await staff.json()).error.code, 'FORBIDDEN');
    assert.equal((await list()).status, 401);
    assert.equal((await list('mediqueue.sid=s%3Afake.fake')).status, 401);
  });

  await t.test('wrong password: 401, no cookie, and the list stays closed', async () => {
    const response = await login('rep_a', 'sai-mat-khau');
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal((await list()).status, 401);
  });

  await t.test('profile outside the grant is refused by the shared check and data is unchanged', async () => {
    const service = createPatientAccessService({ repository: createPatientAccessRepository(pool) });
    const rep = (await pool.query("SELECT user_id FROM users WHERE username = 'rep_a'")).rows[0];
    const actor = { userId: rep.user_id, role: 'REPRESENTATIVE' };
    const before = (await pool.query('SELECT count(*) FROM patient_access')).rows[0].count;
    await assert.rejects(service.assertCanAccessPatient(actor, P.P003), (e) => e.statusCode === 403 && e.code === 'FORBIDDEN');
    await assert.rejects(service.assertCanAccessPatient(actor, '10000000-0000-4000-8000-0000000000ff'), (e) => e.statusCode === 403);
    await assert.rejects(service.assertCanAccessPatient(actor, 'khong-phai-uuid'), (e) => e.statusCode === 400);
    await service.assertCanAccessPatient(actor, P.P001);
    await service.assertCanAccessPatient(actor, P.P002);
    assert.equal((await pool.query('SELECT count(*) FROM patient_access')).rows[0].count, before);
  });
});
