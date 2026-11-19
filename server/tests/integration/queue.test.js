import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createApp } from '../../src/app/app.js';
import {
  migrate,
  seed,
} from '../../src/shared/db/migrations.js';
import { withTransaction } from '../../src/shared/db/transaction.js';

import {
  appendTicketEvent,
} from '../../src/modules/audit/append-ticket-event.js';

import {
  createPatientAccessRepository,
} from '../../src/modules/patients/patient-access.repository.js';
import {
  createPatientAccessService,
} from '../../src/modules/patients/patient-access.service.js';

import {
  createTicketRepository,
} from '../../src/modules/tickets/ticket.repository.js';
import {
  createTicketIssueService,
} from '../../src/modules/tickets/ticket-issue.service.js';

import {
  createQueueService,
} from '../../src/modules/queue/queue.service.js';

const migrationsDir = fileURLToPath(
  new URL('../../../database/migrations/', import.meta.url),
);

const seedsDir = fileURLToPath(
  new URL('../../../database/seeds/', import.meta.url),
);

const IDS = {
  staff: '00000000-0000-4000-8000-000000000001',
  representative: '00000000-0000-4000-8000-000000000002',
  patientOne: '10000000-0000-4000-8000-000000000001',
  patientTwo: '10000000-0000-4000-8000-000000000002',
};

const staff = {
  userId: IDS.staff,
  role: 'STAFF',
};

const representative = {
  userId: IDS.representative,
  role: 'REPRESENTATIVE',
};

test('Queue API and PostgreSQL integration', {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const { default: pg } = await import('pg');

  const schema = `mq_queue_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^mq_queue_test_[a-f0-9]{32}$/);

  const admin = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
  });

  let pool;
  let app;
  let server;
  let schemaCreated = false;

  t.after(async () => {
    try {
      if (server) {
        const closed = new Promise((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
        });

        server.closeAllConnections();
        await closed;
      }
    } finally {
      try {
        if (app) {
          await app.locals.sessionStore.close();
        }
      } finally {
        try {
          if (pool) {
            await pool.end();
          }
        } finally {
          try {
            // Chỉ xóa schema ngẫu nhiên do chính bài kiểm thử tạo.
            if (schemaCreated) {
              await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
            }
          } finally {
            await admin.end();
          }
        }
      }
    }
  });

  await admin.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;

  pool = new pg.Pool({
    connectionString: process.env.TEST_DATABASE_URL,
    options: `-c search_path=${schema},public`,
    max: 10,
  });

  await migrate(pool, migrationsDir);
  await seed(pool, seedsDir);

  app = createApp({
    pool,
    config: {
      clientOrigin: 'http://localhost:5173',
      sessionSecret: 'queue-integration-test-secret-only-123456789',
      cookieSecure: false,
      sessionSchema: schema,
      noShowTimeoutSeconds: 60,
    },
  });

  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  async function login(username) {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password: 'Demo@12345',
      }),
    });

    assert.equal(response.status, 200);

    const cookie = response.headers.get('set-cookie');
    assert.ok(cookie);

    return cookie.split(';')[0];
  }

  const staffCookie = await login('staff_01');
  const representativeCookie = await login('rep_a');

  async function request(method, path, cookie, body) {
    const headers = {};

    if (cookie) {
      headers.Cookie = cookie;
    }

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    return {
      status: response.status,
      body: await response.json(),
    };
  }

  const patientAccess = createPatientAccessService({
    repository: createPatientAccessRepository(pool),
  });

  const issuer = createTicketIssueService({
    db: pool,
    withTransaction,
    createRepository: createTicketRepository,
    patientAccess,
    appendTicketEvent,
  });

  async function prepareSession() {
    // Các thay đổi SQL sau chỉ tạo trạng thái đầu cho ca thử riêng.
    // Không xác nhận API hủy hoặc đóng phiên đã được triển khai.
    await pool.query(`
      UPDATE tickets
      SET status = 'CANCELLED',
          updated_at = statement_timestamp()
      WHERE status IN ('WAITING', 'CALLED', 'REGISTERING')
    `);

    await pool.query(`
      UPDATE queue_sessions
      SET status = 'CLOSED',
          stopped_by = COALESCE(stopped_by, $1),
          stopped_at = COALESCE(stopped_at, statement_timestamp()),
          closed_by = $1,
          closed_at = statement_timestamp(),
          updated_at = statement_timestamp()
      WHERE status IN ('OPEN', 'STOPPED')
    `, [IDS.staff]);

    const result = await pool.query(`
      INSERT INTO queue_sessions (opened_by)
      VALUES ($1)
      RETURNING session_id
    `, [IDS.staff]);

    const sessionId = result.rows[0].session_id;
    const tickets = [];

    for (const patientId of [IDS.patientOne, IDS.patientTwo]) {
      tickets.push(await issuer.issue(representative, {
        sessionId,
        patientId,
        requestId: randomUUID(),
      }));
    }

    return { sessionId, tickets };
  }

  async function calledEventCount(sessionId) {
    const result = await pool.query(`
      SELECT count(*)::int AS count
      FROM ticket_events e
      JOIN tickets t ON t.ticket_id = e.ticket_id
      WHERE t.session_id = $1
        AND e.action = 'CALLED'
    `, [sessionId]);

    return result.rows[0].count;
  }

  await t.test('Waiting and current endpoints return the agreed DTOs', async () => {
    const { sessionId } = await prepareSession();

    const waiting = await request(
      'GET',
      `/queue/waiting?sessionId=${sessionId}`,
      staffCookie,
    );

    assert.equal(waiting.status, 200);
    assert.deepEqual(
      waiting.body.data.tickets.map((item) => item.number),
      [1, 2],
    );

    assert.deepEqual(
      Object.keys(waiting.body.data.tickets[0]).sort(),
      [
        'ticketId',
        'sessionId',
        'patientId',
        'number',
        'status',
        'lastCalledAt',
        'createdAt',
        'updatedAt',
      ].sort(),
    );

    const current = await request(
      'GET',
      `/queue/current?sessionId=${sessionId}`,
      staffCookie,
    );

    assert.equal(current.status, 200);
    assert.equal(current.body.data.ticket, null);
    assert.equal(current.body.data.noShowTimeoutSeconds, 60);
    assert.ok(Number.isFinite(Date.parse(current.body.data.serverTime)));
  });

  await t.test('Call next persists FIFO selection and the CALLED event', async () => {
    const { sessionId, tickets } = await prepareSession();

    const result = await request(
      'POST',
      '/queue/call-next',
      staffCookie,
      { sessionId },
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.data.ticketId, tickets[0].ticketId);
    assert.equal(result.body.data.status, 'CALLED');
    assert.ok(result.body.data.lastCalledAt);

    const stored = await pool.query(`
      SELECT status, last_called_at
      FROM tickets
      WHERE ticket_id = $1
    `, [tickets[0].ticketId]);

    assert.equal(stored.rows[0].status, 'CALLED');
    assert.ok(stored.rows[0].last_called_at);

    const event = await pool.query(`
      SELECT actor_user_id, from_status, to_status
      FROM ticket_events
      WHERE ticket_id = $1 AND action = 'CALLED'
    `, [tickets[0].ticketId]);

    assert.deepEqual(event.rows, [{
      actor_user_id: IDS.staff,
      from_status: 'WAITING',
      to_status: 'CALLED',
    }]);

    const current = await request(
      'GET',
      `/queue/current?sessionId=${sessionId}`,
      staffCookie,
    );

    assert.equal(current.body.data.ticket.ticketId, tickets[0].ticketId);

    const busy = await request(
      'POST',
      '/queue/call-next',
      staffCookie,
      { sessionId },
    );

    assert.equal(busy.status, 409);
    assert.equal(busy.body.error.code, 'COUNTER_BUSY');
    assert.equal(await calledEventCount(sessionId), 1);
  });

  await t.test('Concurrent calls produce exactly one occupied counter slot', async () => {
    const { sessionId } = await prepareSession();

    const results = await Promise.all([
      request('POST', '/queue/call-next', staffCookie, { sessionId }),
      request('POST', '/queue/call-next', staffCookie, { sessionId }),
    ]);

    assert.deepEqual(
      results.map((item) => item.status).sort(),
      [200, 409],
    );

    const failure = results.find((item) => item.status === 409);
    assert.equal(failure.body.error.code, 'COUNTER_BUSY');

    const result = await pool.query(`
      SELECT number, status
      FROM tickets
      WHERE session_id = $1
      ORDER BY number
    `, [sessionId]);

    assert.deepEqual(result.rows, [
      { number: 1, status: 'CALLED' },
      { number: 2, status: 'WAITING' },
    ]);

    assert.equal(await calledEventCount(sessionId), 1);
  });

  await t.test('Cancelled tickets are skipped and an empty queue returns 409', async () => {
    const { sessionId, tickets } = await prepareSession();

    await pool.query(`
      UPDATE tickets
      SET status = 'CANCELLED', updated_at = statement_timestamp()
      WHERE ticket_id = $1
    `, [tickets[0].ticketId]);

    const next = await request(
      'POST',
      '/queue/call-next',
      staffCookie,
      { sessionId },
    );

    assert.equal(next.status, 200);
    assert.equal(next.body.data.number, 2);

    await pool.query(`
      UPDATE tickets
      SET status = 'COMPLETED', updated_at = statement_timestamp()
      WHERE session_id = $1
    `, [sessionId]);

    const empty = await request(
      'POST',
      '/queue/call-next',
      staffCookie,
      { sessionId },
    );

    assert.equal(empty.status, 409);
    assert.equal(empty.body.error.code, 'QUEUE_EMPTY');
  });

  await t.test('STOPPED sessions continue serving existing tickets', async () => {
    const { sessionId } = await prepareSession();

    await pool.query(`
      UPDATE queue_sessions
      SET status = 'STOPPED',
          stopped_by = $1,
          stopped_at = statement_timestamp(),
          updated_at = statement_timestamp()
      WHERE session_id = $2
    `, [IDS.staff, sessionId]);

    const result = await request(
      'POST',
      '/queue/call-next',
      staffCookie,
      { sessionId },
    );

    assert.equal(result.status, 200);
  });

  await t.test('CLOSED and missing sessions are rejected', async () => {
    const { sessionId } = await prepareSession();

    await pool.query(`
      UPDATE tickets
      SET status = 'CANCELLED', updated_at = statement_timestamp()
      WHERE session_id = $1
    `, [sessionId]);

    await pool.query(`
      UPDATE queue_sessions
      SET status = 'CLOSED',
          stopped_by = $1,
          stopped_at = statement_timestamp(),
          closed_by = $1,
          closed_at = statement_timestamp(),
          updated_at = statement_timestamp()
      WHERE session_id = $2
    `, [IDS.staff, sessionId]);

    const closed = await request(
      'POST',
      '/queue/call-next',
      staffCookie,
      { sessionId },
    );

    assert.equal(closed.status, 409);
    assert.equal(closed.body.error.code, 'INVALID_STATE');

    const missing = await request(
      'POST',
      '/queue/call-next',
      staffCookie,
      { sessionId: randomUUID() },
    );

    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'NOT_FOUND');
  });

  await t.test('Authentication, staff role and UUID input are enforced', async () => {
    const { sessionId } = await prepareSession();

    for (const path of [
      `/queue/waiting?sessionId=${sessionId}`,
      `/queue/current?sessionId=${sessionId}`,
    ]) {
      assert.equal((await request('GET', path)).status, 401);
      assert.equal(
        (await request('GET', path, representativeCookie)).status,
        403,
      );
    }

    assert.equal(
      (await request(
        'POST',
        '/queue/call-next',
        undefined,
        { sessionId },
      )).status,
      401,
    );

    assert.equal(
      (await request(
        'POST',
        '/queue/call-next',
        representativeCookie,
        { sessionId },
      )).status,
      403,
    );

    const invalid = await request(
      'POST',
      '/queue/call-next',
      staffCookie,
      { sessionId: 'invalid' },
    );

    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');
    assert.equal(await calledEventCount(sessionId), 0);
  });

  await t.test('Audit failure rolls back both the ticket and real event insert', async () => {
    const { sessionId, tickets } = await prepareSession();

    const service = createQueueService({
      pool,
      noShowTimeoutSeconds: 60,
      appendEvent: async (client, event) => {
        // Gọi helper thật rồi chủ động gây lỗi để kiểm tra rollback.
        await appendTicketEvent(client, event);
        throw new Error('Simulated audit failure.');
      },
    });

    await assert.rejects(
      service.callNext(staff, { sessionId }),
      /Simulated audit failure/,
    );

    const result = await pool.query(`
      SELECT status, last_called_at
      FROM tickets
      WHERE ticket_id = $1
    `, [tickets[0].ticketId]);

    assert.deepEqual(result.rows, [{
      status: 'WAITING',
      last_called_at: null,
    }]);

    assert.equal(await calledEventCount(sessionId), 0);
  });
});