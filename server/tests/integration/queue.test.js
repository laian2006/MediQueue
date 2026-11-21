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

    // Các helper dưới đây dùng chung dữ liệu và kết nối của bài kiểm thử.
  async function callFirstLifecycleTicket() {
    const fixture = await prepareSession();

    const response = await request(
      'POST',
      '/queue/call-next',
      staffCookie,
      { sessionId: fixture.sessionId },
    );

    assert.equal(response.status, 200);

    return {
      ...fixture,
      ticketId: response.body.data.ticketId,
    };
  }

  async function lifecycleRequest(
    action,
    ticketId,
    cookie = staffCookie,
    body,
  ) {
    return request(
      'POST',
      `/queue/tickets/${ticketId}/${action}`,
      cookie,
      body,
    );
  }

  async function readLifecycleTicket(ticketId) {
    const result = await pool.query(
      'SELECT * FROM tickets WHERE ticket_id = $1',
      [ticketId],
    );

    return result.rows[0];
  }

  async function lifecycleEventCount(ticketId, action = null) {
    const result = await pool.query(`
      SELECT count(*)::int AS count
      FROM ticket_events
      WHERE ticket_id = $1
        AND ($2::text IS NULL OR action = $2)
    `, [ticketId, action]);

    return result.rows[0].count;
  }

  await t.test(
    'Recall preserves the ticket and number and refreshes lastCalledAt',
    async () => {
      const { ticketId, sessionId } = await callFirstLifecycleTicket();

      // Điều chỉnh thời gian chỉ trong dữ liệu giả để không cần chờ.
      await pool.query(`
        UPDATE tickets
        SET created_at = statement_timestamp() - interval '2 minutes',
            last_called_at = statement_timestamp() - interval '1 minute',
            updated_at = statement_timestamp()
        WHERE ticket_id = $1
      `, [ticketId]);

      const before = await readLifecycleTicket(ticketId);
      const response = await lifecycleRequest('recall', ticketId);

      assert.equal(response.status, 200);
      assert.equal(response.body.data.ticketId, ticketId);
      assert.equal(response.body.data.number, before.number);
      assert.equal(response.body.data.status, 'CALLED');

      const after = await readLifecycleTicket(ticketId);

      assert.equal(after.ticket_id, before.ticket_id);
      assert.equal(after.session_id, before.session_id);
      assert.equal(after.patient_id, before.patient_id);
      assert.equal(after.number, before.number);
      assert.deepEqual(after.created_at, before.created_at);
      assert.ok(
        after.last_called_at.getTime() > before.last_called_at.getTime(),
      );

      const count = await pool.query(`
        SELECT count(*)::int AS count
        FROM tickets
        WHERE session_id = $1
      `, [sessionId]);

      assert.equal(count.rows[0].count, 2);

      const events = await pool.query(`
        SELECT action, from_status, to_status, actor_user_id
        FROM ticket_events
        WHERE ticket_id = $1 AND action = 'RECALLED'
      `, [ticketId]);

      assert.deepEqual(events.rows, [{
        action: 'RECALLED',
        from_status: 'CALLED',
        to_status: 'CALLED',
        actor_user_id: IDS.staff,
      }]);
    },
  );

  await t.test(
    'Start occupies the counter and completion releases it',
    async () => {
      const { ticketId, sessionId, tickets } =
        await callFirstLifecycleTicket();

      const before = await readLifecycleTicket(ticketId);

      const started = await lifecycleRequest('start', ticketId);
      assert.equal(started.status, 200);
      assert.equal(started.body.data.status, 'REGISTERING');

      const busy = await request(
        'POST',
        '/queue/call-next',
        staffCookie,
        { sessionId },
      );

      assert.equal(busy.status, 409);
      assert.equal(busy.body.error.code, 'COUNTER_BUSY');

      const completed = await lifecycleRequest('complete', ticketId);
      assert.equal(completed.status, 200);
      assert.equal(completed.body.data.status, 'COMPLETED');

      const after = await readLifecycleTicket(ticketId);
      assert.deepEqual(after.last_called_at, before.last_called_at);

      const current = await request(
        'GET',
        `/queue/current?sessionId=${sessionId}`,
        staffCookie,
      );

      assert.equal(current.status, 200);
      assert.equal(current.body.data.ticket, null);

      const next = await request(
        'POST',
        '/queue/call-next',
        staffCookie,
        { sessionId },
      );

      assert.equal(next.status, 200);
      assert.equal(next.body.data.ticketId, tickets[1].ticketId);

      const events = await pool.query(`
        SELECT action, from_status, to_status
        FROM ticket_events
        WHERE ticket_id = $1
          AND action IN ('STARTED', 'COMPLETED')
        ORDER BY occurred_at, event_id
      `, [ticketId]);

      assert.deepEqual(events.rows, [
        {
          action: 'STARTED',
          from_status: 'CALLED',
          to_status: 'REGISTERING',
        },
        {
          action: 'COMPLETED',
          from_status: 'REGISTERING',
          to_status: 'COMPLETED',
        },
      ]);
    },
  );

  await t.test(
    'Invalid lifecycle transitions leave the ticket and events unchanged',
    async () => {
      const actions = ['recall', 'start', 'complete'];

      const allowed = {
        CALLED: ['recall', 'start'],
        REGISTERING: ['complete'],
      };

      for (const status of [
        'WAITING',
        'CALLED',
        'REGISTERING',
        'COMPLETED',
        'CANCELLED',
        'NO_SHOW',
      ]) {
        const { tickets } = await prepareSession();
        const ticketId = tickets[0].ticketId;

        // Tạo trạng thái đầu cho từng ca thử, không dùng làm code nghiệp vụ.
        await pool.query(`
          UPDATE tickets
          SET status = $2,
              last_called_at = CASE
                WHEN $2 = 'WAITING' THEN NULL
                ELSE statement_timestamp()
              END,
              updated_at = statement_timestamp()
          WHERE ticket_id = $1
        `, [ticketId, status]);

        const before = await readLifecycleTicket(ticketId);
        const eventsBefore = await lifecycleEventCount(ticketId);

        for (const action of actions) {
          if ((allowed[status] ?? []).includes(action)) {
            continue;
          }

          const response = await lifecycleRequest(action, ticketId);

          assert.equal(response.status, 409, `${action} from ${status}`);
          assert.equal(response.body.error.code, 'INVALID_STATE');
          assert.deepEqual(await readLifecycleTicket(ticketId), before);
          assert.equal(
            await lifecycleEventCount(ticketId),
            eventsBefore,
          );
        }
      }
    },
  );

  await t.test(
    'Lifecycle endpoints enforce authentication UUIDs and empty requests',
    async () => {
      const { ticketId } = await callFirstLifecycleTicket();

      for (const action of ['recall', 'start', 'complete']) {
        assert.equal(
          (await lifecycleRequest(action, ticketId, null)).status,
          401,
        );

        assert.equal(
          (await lifecycleRequest(
            action,
            ticketId,
            representativeCookie,
          )).status,
          403,
        );

        assert.equal(
          (await lifecycleRequest(action, 'invalid')).status,
          400,
        );

        assert.equal(
          (await lifecycleRequest(action, randomUUID())).status,
          404,
        );

        assert.equal(
          (await lifecycleRequest(
            action,
            ticketId,
            staffCookie,
            {},
          )).status,
          400,
        );

        const query = await request(
          'POST',
          `/queue/tickets/${ticketId}/${action}?extra=1`,
          staffCookie,
        );

        assert.equal(query.status, 400);
      }

      assert.equal(
        (await readLifecycleTicket(ticketId)).status,
        'CALLED',
      );
    },
  );

  await t.test(
    'STOPPED sessions allow recall start and completion',
    async () => {
      const { ticketId, sessionId } = await callFirstLifecycleTicket();

      await pool.query(`
        UPDATE queue_sessions
        SET status = 'STOPPED',
            stopped_by = $1,
            stopped_at = statement_timestamp(),
            updated_at = statement_timestamp()
        WHERE session_id = $2
      `, [IDS.staff, sessionId]);

      for (const [action, expected] of [
        ['recall', 'CALLED'],
        ['start', 'REGISTERING'],
        ['complete', 'COMPLETED'],
      ]) {
        const response = await lifecycleRequest(action, ticketId);

        assert.equal(response.status, 200);
        assert.equal(response.body.data.status, expected);
      }
    },
  );

  await t.test(
    'CLOSED sessions reject every lifecycle operation',
    async () => {
      const { ticketId, sessionId } = await callFirstLifecycleTicket();

      // Chỉ thiết lập dữ liệu phiên đã kết thúc trong schema thử nghiệm.
      await pool.query(`
        UPDATE tickets
        SET status = 'COMPLETED',
            updated_at = statement_timestamp()
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

      const before = await readLifecycleTicket(ticketId);
      const eventsBefore = await lifecycleEventCount(ticketId);

      for (const action of ['recall', 'start', 'complete']) {
        const response = await lifecycleRequest(action, ticketId);

        assert.equal(response.status, 409);
        assert.equal(response.body.error.code, 'INVALID_STATE');
      }

      assert.deepEqual(await readLifecycleTicket(ticketId), before);
      assert.equal(await lifecycleEventCount(ticketId), eventsBefore);
    },
  );

  await t.test(
    'Audit failure rolls back each lifecycle update and real event insert',
    async () => {
      for (const action of ['recall', 'start', 'complete']) {
        const { ticketId } = await callFirstLifecycleTicket();

        const service = createQueueService({
          pool,
          noShowTimeoutSeconds: 60,
        });

        if (action === 'complete') {
          await service.start(staff, ticketId);
        }

        const before = await readLifecycleTicket(ticketId);
        const eventsBefore = await lifecycleEventCount(ticketId);

        const failingService = createQueueService({
          pool,
          noShowTimeoutSeconds: 60,
          appendEvent: async (client, event) => {
            // Chèn sự kiện thật rồi gây lỗi để chứng minh rollback.
            await appendTicketEvent(client, event);
            throw new Error('Simulated lifecycle audit failure.');
          },
        });

        await assert.rejects(
          failingService[action](staff, ticketId),
          /Simulated lifecycle audit failure/,
        );

        assert.deepEqual(await readLifecycleTicket(ticketId), before);
        assert.equal(
          await lifecycleEventCount(ticketId),
          eventsBefore,
        );
      }
    },
  );

  await t.test(
    'Concurrent starts and completions create one transition each',
    async () => {
      const { ticketId, sessionId, tickets } =
        await callFirstLifecycleTicket();

      const starts = await Promise.all([
        lifecycleRequest('start', ticketId),
        lifecycleRequest('start', ticketId),
      ]);

      assert.deepEqual(
        starts.map((result) => result.status).sort(),
        [200, 409],
      );

      assert.equal(
        (await readLifecycleTicket(ticketId)).status,
        'REGISTERING',
      );

      assert.equal(await lifecycleEventCount(ticketId, 'STARTED'), 1);

      const completions = await Promise.all([
        lifecycleRequest('complete', ticketId),
        lifecycleRequest('complete', ticketId),
      ]);

      assert.deepEqual(
        completions.map((result) => result.status).sort(),
        [200, 409],
      );

      assert.equal(
        (await readLifecycleTicket(ticketId)).status,
        'COMPLETED',
      );

      assert.equal(
        await lifecycleEventCount(ticketId, 'COMPLETED'),
        1,
      );

      const next = await request(
        'POST',
        '/queue/call-next',
        staffCookie,
        { sessionId },
      );

      assert.equal(next.status, 200);
      assert.equal(next.body.data.ticketId, tickets[1].ticketId);
    },
  );
});

