import { withTransaction } from '../../shared/db/transaction.js';
import { appendTicketEvent } from '../audit/append-ticket-event.js';
import { toTicketDto } from '../tickets/ticket.dto.js';

import { QueueError } from './queue.errors.js';
import { createQueueRepository } from './queue.repository.js';
import {
  getLifecycleTransition,
  QueueRuleError,
} from './queue.rules.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireStaffActor(actor) {
  // Chỉ tin danh tính do middleware của máy chủ cung cấp.
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
      'Only staff members can operate the queue.',
    );
  }
}

export function createQueueLifecycleService({
  pool,
  appendEvent = appendTicketEvent,
}) {
  if (
    typeof pool?.connect !== 'function'
    || typeof appendEvent !== 'function'
  ) {
    throw new TypeError('Valid lifecycle dependencies are required.');
  }

  async function applyAction(actor, ticketId, action) {
    requireStaffActor(actor);

    if (typeof ticketId !== 'string' || !UUID.test(ticketId)) {
      throw new QueueError(
        400,
        'VALIDATION_ERROR',
        'ticketId must be a UUID.',
      );
    }

    const normalizedId = ticketId.toLowerCase();

    return withTransaction(pool, async (client) => {
      const repository = createQueueRepository(client);

      // Đọc vị trí để biết cần khóa phiên nào.
      const location = await repository.findTicketSession(normalizedId);

      if (!location) {
        throw new QueueError(
          404,
          'NOT_FOUND',
          'The ticket was not found.',
        );
      }

      // Luôn khóa phiên trước, sau đó mới khóa phiếu.
      const session = await repository.lockSession(location.session_id);

      if (!session || !['OPEN', 'STOPPED'].includes(session.status)) {
        throw new QueueError(
          409,
          'INVALID_STATE',
          'The queue session is not active.',
        );
      }

      const ticket = await repository.lockTicket(
        normalizedId,
        location.session_id,
      );

      if (!ticket) {
        throw new QueueError(
          404,
          'NOT_FOUND',
          'The ticket was not found.',
        );
      }

      // Dùng trạng thái vừa đọc sau khi đã lấy được khóa.
      let transition;

      try {
        transition = getLifecycleTransition(action, ticket.status);
      } catch (error) {
        if (error instanceof QueueRuleError) {
          throw new QueueError(409, error.code, error.message);
        }

        throw error;
      }

      const updated = await repository.updateLifecycle({
        ticketId: normalizedId,
        sessionId: location.session_id,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        refreshCalledAt: transition.refreshCalledAt,
      });

      if (!updated) {
        throw new QueueError(
          409,
          'INVALID_STATE',
          'The ticket state has changed.',
        );
      }

      // Ghi sự kiện bằng chính client đang cập nhật phiếu.
      await appendEvent(client, {
        ticketId: updated.ticket_id,
        actorUserId: actor.userId,
        action: transition.eventAction,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
      });

      return toTicketDto(updated);
    });
  }

  return {
    recall: (actor, ticketId) =>
      applyAction(actor, ticketId, 'recall'),

    start: (actor, ticketId) =>
      applyAction(actor, ticketId, 'start'),

    complete: (actor, ticketId) =>
      applyAction(actor, ticketId, 'complete'),
  };
}