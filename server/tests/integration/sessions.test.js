import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createSessionRepository } from '../../src/modules/sessions/session.repository.js';
import { createSessionService } from '../../src/modules/sessions/session.service.js';

// No database URL means an explicit skip, never a claimed integration pass.
test('WBS 1.1: Express + PostgreSQL integration', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const { default: express } = await import('express');
  const { default: pg } = await import('pg');
  const { createSessionRouter } = await import('../../src/modules/sessions/session.routes.js');
  const schema = `mq_sessions_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^mq_sessions_test_[a-f0-9]{32}$/);
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let pool;
  let server;
  let schemaCreated = false;
  let baseUrl;
  t.after(async () => {
    try {
      if (server?.listening) await new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
      if (pool) await pool.end();
      if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await admin.end();
    }
  });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${schema},public`, max: 10,
  });
  await pool.query(await readFile(new URL('../fixtures/sessions.identity.sql', import.meta.url), 'utf8'));
  await pool.query(await readFile(new URL('../../../database/migrations/002_sessions.sql', import.meta.url), 'utf8'));

  const actors = {
    staff: { userId: '00000000-0000-4000-8000-000000000001', role: 'STAFF' },
    rep: { userId: '00000000-0000-4000-8000-000000000002', role: 'REPRESENTATIVE' },
    staff2: { userId: '00000000-0000-4000-8000-000000000003', role: 'STAFF' },
  };
  const service = createSessionService({ repository: createSessionRepository(pool) });

  function makeApp(sessionService = service) {
    const app = express();
    app.use(express.json());
    // TEST DOUBLE ONLY. Production must use Hung's server-side session middleware.
    const authenticate = (req, res, next) => {
      const actor = actors[req.get('x-test-actor')];
      if (!actor) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' } });
      req.user = actor;
      next();
    };
    const requireStaff = (req, res, next) => {
      if (req.user.role !== 'STAFF') return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Staff required' } });
      next();
    };
    app.use('/api/v1/sessions', createSessionRouter({ sessionService, authenticate, requireStaff }));
    app.use((error, _req, res, _next) => {
      const badJson = error.type === 'entity.parse.failed';
      res.status(badJson ? 400 : 500).json({ error: {
        code: badJson ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
        message: badJson ? 'Invalid JSON' : 'Internal server error',
      } });
    });
    return app;
  }

  async function start(app = makeApp()) {
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/sessions`;
  }

  async function request(method, path = '', actor = 'staff', body) {
    const headers = actor ? { 'x-test-actor': actor } : {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(baseUrl + path, { method, headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
  }

  const count = async () => Number((await pool.query('SELECT count(*) FROM queue_sessions')).rows[0].count);
  const clear = () => pool.query('DELETE FROM queue_sessions');
  const stop = () => pool.query(`UPDATE queue_sessions SET status='STOPPED',
    stopped_by=$1, stopped_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE status='OPEN'`, [actors.staff.userId]);
  const close = () => pool.query(`UPDATE queue_sessions SET status='CLOSED',
    closed_by=$1, closed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE status='STOPPED'`, [actors.staff.userId]);
  await start();

  await t.test('anonymous read/open is 401 and does not write', async () => {
    for (const [method, path] of [['GET', '/current'], ['POST', '']]) {
      const result = await request(method, path, null);
      assert.equal(result.status, 401);
      assert.equal(result.body.error.code, 'UNAUTHENTICATED');
    }
    assert.equal(await count(), 0);
  });

  await t.test('both roles get data=null when there is no active session', async () => {
    for (const actor of ['staff', 'rep']) {
      const result = await request('GET', '/current', actor);
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { data: null });
      assert.equal(result.headers.get('cache-control'), 'no-store');
    }
  });

  await t.test('representative cannot open; no write', async () => {
    const result = await request('POST', '', 'rep');
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, 'FORBIDDEN');
    assert.equal(await count(), 0);
  });

  await t.test('client cannot set actor/status/number or send non-object bodies', async () => {
    for (const body of [{ openedBy: actors.rep.userId }, { status: 'CLOSED' }, { lastIssuedNumber: 12 }, [], null, 'text']) {
      assert.equal((await request('POST', '', 'staff', body)).status, 400);
    }
    assert.equal(await count(), 0);
  });

  await t.test('malformed JSON and raw text are rejected before writing', async () => {
    for (const [type, body] of [['application/json', '{'], ['text/plain', 'unexpected']]) {
      const result = await fetch(baseUrl, { method: 'POST', headers: {
        'x-test-actor': 'staff', 'content-type': type,
      }, body });
      assert.equal(result.status, 400);
    }
    assert.equal(await count(), 0);
  });

  let opened;
  await t.test('staff opens 201: UUID, OPEN, zero, UTC, null times and exact DTO', async () => {
    const result = await request('POST');
    assert.equal(result.status, 201);
    opened = result.body.data;
    assert.deepEqual(Object.keys(opened).sort(), ['sessionId', 'status', 'lastIssuedNumber', 'openedAt', 'stoppedAt', 'closedAt'].sort());
    assert.match(opened.sessionId, /^[0-9a-f-]{36}$/);
    assert.equal(opened.status, 'OPEN');
    assert.equal(opened.lastIssuedNumber, 0);
    assert.equal(new Date(opened.openedAt).toISOString(), opened.openedAt);
    assert.equal(opened.stoppedAt, null);
    assert.equal(opened.closedAt, null);
    const row = (await pool.query('SELECT * FROM queue_sessions')).rows[0];
    assert.equal(row.opened_by, actors.staff.userId);
    assert.equal(await count(), 1);
  });

  await t.test('both roles read the same OPEN session', async () => {
    for (const actor of ['staff', 'rep']) {
      const result = await request('GET', '/current', actor);
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { data: opened });
    }
  });

  await t.test('another OPEN request returns 409 without changing the existing session', async () => {
    const result = await request('POST', '', 'staff2', {});
    assert.equal(result.status, 409);
    assert.equal(result.body.error.code, 'SESSION_ALREADY_ACTIVE');
    assert.equal(await count(), 1);
    assert.deepEqual((await request('GET', '/current')).body.data, opened);
  });

  await t.test('STOPPED remains current and blocks a new OPEN', async () => {
    await stop(); // Fixture transition only: stop API belongs to WBS 2.1.
    const result = await request('GET', '/current', 'rep');
    assert.equal(result.body.data.status, 'STOPPED');
    assert.equal(result.body.data.sessionId, opened.sessionId);
    assert.ok(result.body.data.stoppedAt.endsWith('Z'));
    assert.equal((await request('POST')).body.error.code, 'SESSION_ALREADY_ACTIVE');
    assert.equal(await count(), 1);
  });

  await t.test('CLOSED is excluded; opening starts at zero and preserves history', async () => {
    await close(); // Fixture transition only: close API belongs to WBS 2.1.
    assert.deepEqual((await request('GET', '/current')).body, { data: null });
    const result = await request('POST', '', 'staff2', {});
    assert.equal(result.status, 201);
    assert.notEqual(result.body.data.sessionId, opened.sessionId);
    assert.equal(result.body.data.lastIssuedNumber, 0);
    assert.equal(await count(), 2);
    assert.equal((await pool.query('SELECT status FROM queue_sessions WHERE session_id=$1', [opened.sessionId])).rows[0].status, 'CLOSED');
  });

  await t.test('3 rounds of 20 concurrent opens: exactly 1 created, 19 conflicts and 1 DB row each', async () => {
    for (let round = 0; round < 3; round++) {
      await clear();
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => request('POST', '', i % 2 ? 'staff' : 'staff2')));
      assert.equal(results.filter((r) => r.status === 201).length, 1);
      assert.equal(results.filter((r) => r.status === 409 && r.body.error.code === 'SESSION_ALREADY_ACTIVE').length, 19);
      assert.equal(await count(), 1);
      assert.equal((await pool.query('SELECT count(*) FROM queue_sessions WHERE status IN (\'OPEN\',\'STOPPED\')')).rows[0].count, '1');
    }
  });

  await t.test('DB also rejects a direct second OPEN and mixed OPEN/STOPPED', async () => {
    await assert.rejects(pool.query('INSERT INTO queue_sessions(opened_by) VALUES($1)', [actors.staff.userId]),
      (e) => e.code === '23505' && e.constraint === 'uq_queue_sessions_single_active');
    await assert.rejects(pool.query(`INSERT INTO queue_sessions(opened_by,status,stopped_by,stopped_at)
      VALUES($1,'STOPPED',$1,CURRENT_TIMESTAMP)`, [actors.staff.userId]),
      (e) => e.code === '23505' && e.constraint === 'uq_queue_sessions_single_active');
    await stop();
    await assert.rejects(pool.query('INSERT INTO queue_sessions(opened_by) VALUES($1)', [actors.staff.userId]),
      (e) => e.code === '23505' && e.constraint === 'uq_queue_sessions_single_active');
    assert.equal(await count(), 1);
  });

  await t.test('DB protects status, counter, lifecycle, UUID FK and required audit actor', async () => {
    const checks = [
      ["UPDATE queue_sessions SET status='UNKNOWN'", [], '23514'],
      ['UPDATE queue_sessions SET last_issued_number=-1', [], '23514'],
      ['UPDATE queue_sessions SET stopped_by=NULL', [], '23514'],
      ["UPDATE queue_sessions SET closed_at=CURRENT_TIMESTAMP", [], '23514'],
      ['UPDATE queue_sessions SET opened_by=$1', [randomUUID()], '23503'],
      ['UPDATE queue_sessions SET opened_by=NULL', [], '23502'],
      ["UPDATE queue_sessions SET stopped_at=opened_at - interval '1 second'", [], '23514'],
    ];
    for (const [sql, values, code] of checks) {
      await assert.rejects(pool.query(sql, values), (e) => e.code === code);
    }
    assert.equal((await pool.query('SELECT status FROM queue_sessions')).rows[0].status, 'STOPPED');
  });

  await t.test('restart of the Express app preserves the same session in PostgreSQL', async () => {
    const before = (await request('GET', '/current')).body;
    await new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
    await start();
    assert.deepEqual((await request('GET', '/current')).body, before);
  });

  await t.test('missing middleware fails closed at router creation', () => {
    assert.throws(() => createSessionRouter({ sessionService: service }), TypeError);
  });

  await t.test('unexpected service errors reach the shared handler without leaking DB detail', async () => {
    await new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
    await start(makeApp({ getCurrent: async () => { throw new Error('secret database detail'); } }));
    const result = await request('GET', '/current');
    assert.equal(result.status, 500);
    assert.deepEqual(result.body, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });
});
