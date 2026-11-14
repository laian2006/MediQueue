import { withTransaction } from '../../shared/db/transaction.js';
import { appendTicketEvent } from '../audit/append-ticket-event.js';
import { toTicketDto } from '../tickets/ticket.dto.js';

import {
  QueueRuleError,
  canTransition,
  selectNextWaitingTicket,
} from './queue.rules.js';

import { QueueError } from './queue.errors.js';
import { createQueueRepository } from './queue.repository.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireStaffActor(actor) {
  // Danh tính phải do middleware máy chủ cung cấp.
  if (
    !actor
    || typeof actor.userId !== 'string'
    || !UUID.test(actor.userId)
  ) {
    throw new QueueError(
      401,
      'UNAUTHENTICATED',
      'Authentication is required.',
    );
  }

  if (actor.role !== 'STAFF') {
    throw new QueueError(
      403,
      'FORBIDDEN',
      'Only staff members can access the queue.',
    );
  }
}

function parseSessionInput(input) {
  // Không nhận userId hoặc role do trình duyệt tự gửi.
  if (
    !input
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.keys(input).length !== 1
    || typeof input.sessionId !== 'string'
    || !UUID.test(input.sessionId)
  ) {
    throw new QueueError(
      400,
      'VALIDATION_ERROR',
      'Exactly one UUID sessionId is required.',
    );
  }

  return input.sessionId.toLowerCase();
}

function requireActiveSession(session) {
  if (!session) {
    throw new QueueError(
      404,
      'NOT_FOUND',
      'The queue session was not found.',
    );
  }

  if (!['OPEN', 'STOPPED'].includes(session.status)) {
    throw new QueueError(
      409,
      'INVALID_STATE',
      'The queue session is not active.',
    );
  }
}

export function createQueueService({
  pool,
  noShowTimeoutSeconds,
  appendEvent = appendTicketEvent,
  now = () => new Date(),
}) {
  if (typeof pool?.connect !== 'function') {
    throw new TypeError('A shared PostgreSQL pool is required.');
  }

  if (
    !Number.isSafeInteger(noShowTimeoutSeconds)
    || noShowTimeoutSeconds <= 0
  ) {
    throw new TypeError(
      'noShowTimeoutSeconds must be a positive safe integer.',
    );
  }

  if (
    typeof appendEvent !== 'function'
    || typeof now !== 'function'
  ) {
    throw new TypeError('Queue service dependencies are invalid.');
  }

  async function inSession(actor, input, operation) {
    requireStaffActor(actor);
    const sessionId = parseSessionInput(input);

    // Dùng đúng chữ ký helper của Trực: pool và callback.
    return withTransaction(pool, async (client) => {
      const repository = createQueueRepository(client);

      // Khóa ngắn cả khi đọc để kiểm tra phiên và đọc dữ liệu nhất quán.
      const session = await repository.lockSession(sessionId);
      requireActiveSession(session);

      return operation(repository, client, sessionId);
    });
  }

  return {
    async getWaiting(actor, input) {
      return inSession(
        actor,
        input,
        async (repository, _client, sessionId) => {
          const rows = await repository.listActive(sessionId);

          return {
            tickets: rows
              .filter((row) => row.status === 'WAITING')
              .map(toTicketDto),
          };
        },
      );
    },

    async getCurrent(actor, input) {
      return inSession(
        actor,
        input,
        async (repository, _client, sessionId) => {
          const rows = await repository.listActive(sessionId);

          const current = rows.find((row) =>
            row.status === 'CALLED'
            || row.status === 'REGISTERING',
          );

          return {
            ticket: current ? toTicketDto(current) : null,
            noShowTimeoutSeconds,
            serverTime: now().toISOString(),
          };
        },
      );
    },

    async callNext(actor, input) {
      return inSession(
        actor,
        input,
        async (repository, client, sessionId) => {
          // Phiên đã được khóa trước khi khóa phiếu.
          const rows = await repository.listActive(sessionId, true);

          let selected;

          try {
            selected = selectNextWaitingTicket(rows, sessionId);
          } catch (error) {
            if (
              error instanceof QueueRuleError
              && error.code === 'COUNTER_BUSY'
            ) {
              throw new QueueError(
                409,
                'COUNTER_BUSY',
                'The counter is currently occupied.',
              );
            }

            throw error;
          }

          if (!selected) {
            throw new QueueError(
              409,
              'QUEUE_EMPTY',
              'There are no waiting tickets.',
            );
          }

          if (!canTransition(selected.status, 'CALLED')) {
            throw new QueueError(
              409,
              'INVALID_STATE',
              'The ticket cannot be called.',
            );
          }

          const updated = await repository.markCalled(
            selected.ticket_id,
            sessionId,
          );

          if (!updated) {
            throw new QueueError(
              409,
              'INVALID_STATE',
              'The ticket is no longer waiting.',
            );
          }

          // Cập nhật phiếu và sự kiện dùng cùng client giao dịch.
          await appendEvent(client, {
            ticketId: updated.ticket_id,
            actorUserId: actor.userId,
            action: 'CALLED',
            fromStatus: 'WAITING',
            toStatus: 'CALLED',
          });

          return toTicketDto(updated);
        },
      );
    },
  };
}