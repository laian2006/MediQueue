import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { mkdtemp, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { createApp } from '../../src/app/app.js';
import { migrate, seed } from '../../src/shared/db/migrations.js';
import { withTransaction } from '../../src/shared/db/transaction.js';

const migrations = fileURLToPath(new URL('../../../database/migrations/', import.meta.url));
const seeds = fileURLToPath(new URL('../../../database/seeds/', import.meta.url));

test('WBS 1.19: common app, migration history, PostgreSQL sessions and rollback', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const schema = `mq_scaffold_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let pool;
  const running = [];
  const temporary = await mkdtemp(join(tmpdir(), 'mq-migrations-'));
  assert.ok(temporary.startsWith(join(tmpdir(), 'mq-migrations-')));
  const config = { clientOrigin: 'http://localhost:5173', sessionSecret: 'test-only-secret-'.repeat(4), cookieSecure: false, noShowTimeoutSeconds: 60, sessionSchema: schema };
  t.after(async () => {
    for (const { app, server } of running) {
      if (server.listening) await new Promise((resolve) => server.close(resolve));
      await app.locals.sessionStore.close();
    }
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    await rm(temporary, { recursive: true, force: true });
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
  await t.test('fresh migrations apply once; seed can run twice', async () => {
    assert.deepEqual(await migrate(pool, migrations), ['001_identity.sql', '002_sessions.sql']);
    assert.deepEqual(await migrate(pool, migrations), []);
    await seed(pool, seeds);
    await seed(pool, seeds);
    assert.equal(Number((await pool.query('SELECT count(*) FROM users')).rows[0].count), 3);
  });
  await t.test('changed applied migration and out-of-order migration are refused', async () => {
    await copyFile(join(migrations, '001_identity.sql'), join(temporary, '001_identity.sql'));
    await copyFile(join(migrations, '002_sessions.sql'), join(temporary, '002_sessions.sql'));
    await writeFile(join(temporary, '001_identity.sql'), '-- changed');
    await assert.rejects(migrate(pool, temporary), /missing or changed/);
    await copyFile(join(migrations, '001_identity.sql'), join(temporary, '001_identity.sql'));
    await writeFile(join(temporary, '000_old.sql'), 'SELECT 1');
    await assert.rejects(migrate(pool, temporary), /older migration/);
    await rm(join(temporary, '000_old.sql'));
  });
  await t.test('failed migration rolls back DDL and does not record completion', async () => {
    await writeFile(join(temporary, '003_broken.sql'), 'CREATE TABLE rollback_probe (id int); SELECT * FROM no_such_table;');
    await assert.rejects(migrate(pool, temporary));
    assert.equal((await pool.query("SELECT to_regclass('rollback_probe') AS name")).rows[0].name, null);
    assert.equal(Number((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count), 2);
  });
  async function start() {
    const app = createApp({ pool, config });
    const server = app.listen(0, '127.0.0.1');
    running.push({ app, server });
    await once(server, 'listening');
    return { app, server, url: `http://127.0.0.1:${server.address().port}/api/v1` };
  }
  const first = await start();
  const login = (url, username) => fetch(`${url}/auth/login`, { method: 'POST', headers: { Origin: config.clientOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'Demo@12345' }) });
  let staffCookie;
  await t.test('real cookie login uses PostgreSQL store; representative cannot open session', async () => {
    assert.equal((await fetch(`${first.url}/health`)).status, 200);
    assert.equal((await fetch(`${first.url}/sessions/current`)).status, 401);
    const response = await login(first.url, 'staff_01');
    assert.equal(response.status, 200);
    const setCookie = response.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    staffCookie = setCookie.split(';')[0];
    assert.equal(Number((await pool.query('SELECT count(*) FROM auth_sessions')).rows[0].count), 1);
    const representative = await login(first.url, 'rep_a');
    const repCookie = representative.headers.get('set-cookie').split(';')[0];
    const denied = await fetch(`${first.url}/sessions`, { method: 'POST', headers: { Cookie: repCookie, Origin: config.clientOrigin } });
    assert.equal(denied.status, 403);
  });
  await t.test('session remains valid after app restart, concurrent opens use real auth', async () => {
    await new Promise((resolve) => first.server.close(resolve));
    await first.app.locals.sessionStore.close();
    const second = await start();
    const me = await fetch(`${second.url}/auth/me`, { headers: { Cookie: staffCookie } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).data.role, 'STAFF');
    const responses = await Promise.all([1, 2].map(() => fetch(`${second.url}/sessions`, {
      method: 'POST', headers: { Cookie: staffCookie, Origin: config.clientOrigin, 'Content-Type': 'application/json' }, body: '{}',
    })));
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  });
  const current = running.at(-1).server.address();
  const url = `http://127.0.0.1:${current.port}/api/v1`;
  await t.test('Origin, Fetch Metadata and malformed JSON reject writes before business changes', async () => {
    const hostile = await fetch(`${url}/auth/login`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(hostile.status, 403);
    assert.equal(hostile.headers.get('access-control-allow-origin'), null);
    const missing = await fetch(`${url}/sessions`, { method: 'POST', headers: { Cookie: staffCookie, 'Sec-Fetch-Site': 'cross-site' } });
    assert.equal(missing.status, 403);
    const malformed = await fetch(`${url}/sessions`, { method: 'POST', headers: { Cookie: staffCookie, Origin: config.clientOrigin, 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
    const preflight = await fetch(`${url}/sessions`, { method: 'OPTIONS', headers: { Origin: config.clientOrigin } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), config.clientOrigin);
  });
  await t.test('transaction rollback on PostgreSQL preserves original data', async () => {
    await assert.rejects(withTransaction(pool, async (transaction) => {
      await transaction.query("UPDATE users SET display_name = 'must roll back' WHERE username = 'rep_a'");
      throw new Error('business failed');
    }), /business failed/);
    assert.notEqual((await pool.query("SELECT display_name FROM users WHERE username = 'rep_a'")).rows[0].display_name, 'must roll back');
  });
  await t.test('database outage gives generic health/API errors without SQL or credentials', async () => {
    const offlinePool = { query: async () => { throw new Error('SECRET postgres://password SELECT users'); } };
    const app = createApp({ pool: offlinePool, config });
    const server = app.listen(0, '127.0.0.1');
    running.push({ app, server });
    await once(server, 'listening');
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/health`);
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /SECRET|password|SELECT/);
    const failedLogin = await login(`http://127.0.0.1:${server.address().port}/api/v1`, 'staff_01');
    assert.equal(failedLogin.status, 500);
    assert.doesNotMatch(await failedLogin.text(), /SECRET|password|SELECT/);
  });
});
