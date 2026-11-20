import { withTransaction } from '../../shared/db/transaction.js';
import { appendTicketEvent } from '../audit/append-ticket-event.js';
import { toTicketDto } from '../tickets/ticket.dto.js';

import { QueueError } from './queue.errors.js';
import { createQueueRepository } from './queue.repository.js';
import {
  canTransition,
  evaluateNoShowWindow,
} from './queue.rules.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireStaffActor(actor) {
  // Danh tính phải được middleware xác thực của máy chủ cung cấp.
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

export function createQueueNoShowService({
  pool,
  noShowTimeoutSeconds,
  appendEvent = appendTicketEvent,
  noShowClock = () => null,
}) {
  if (
    typeof pool?.connect !== 'function'
    || typeof appendEvent !== 'function'
    || typeof noShowClock !== 'function'
  ) {
    throw new TypeError('Valid no-show dependencies are required.');
  }

  if (
    !Number.isSafeInteger(noShowTimeoutSeconds)
    || noShowTimeoutSeconds <= 0
  ) {
    throw new TypeError(
      'noShowTimeoutSeconds must be a positive safe integer.',
    );
  }

  return {
    async noShow(actor, ticketId) {
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

        // Đọc vị trí phiếu nhưng chưa khóa phiếu.
        const location = await repository.findTicketSession(normalizedId);

        if (!location) {
          throw new QueueError(
            404,
            'NOT_FOUND',
            'The ticket was not found.',
          );
        }

        // Giữ cùng thứ tự khóa với gọi số, gọi lại và hủy phiếu.
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

        // Kiểm tra trạng thái sau khi lấy khóa, không dùng dữ liệu cũ.
        if (
          ticket.status !== 'CALLED'
          || !canTransition(ticket.status, 'NO_SHOW')
          || ticket.last_called_at === null
        ) {
          throw new QueueError(
            409,
            'INVALID_STATE',
            'Only a called ticket with a call timestamp can be marked absent.',
          );
        }

        // null nghĩa là dùng đồng hồ PostgreSQL.
        // Đồng hồ thay thế chỉ được truyền khi tạo service cho kiểm thử.
        const referenceTime = await noShowClock(client);

        if (
          referenceTime !== null
          && (
            typeof referenceTime !== 'string'
            || referenceTime.trim() === ''
          )
        ) {
          throw new TypeError(
            'The no-show test clock must return a timestamp string or null.',
          );
        }

        const remaining = await repository.getNoShowRemainingMilliseconds({
          ticketId: normalizedId,
          sessionId: location.session_id,
          timeoutSeconds: noShowTimeoutSeconds,
          referenceTime,
        });

        if (remaining === null) {
          throw new QueueError(
            409,
            'INVALID_STATE',
            'The ticket does not have a valid call timestamp.',
          );
        }

        const window = evaluateNoShowWindow(Number(remaining));

        if (!window.allowed) {
          throw new QueueError(
            409,
            'NO_SHOW_TOO_EARLY',
            'The no-show timeout has not elapsed.',
            {
              remainingSeconds: window.remainingSeconds,
            },
          );
        }

        const updated = await repository.updateLifecycle({
          ticketId: normalizedId,
          sessionId: location.session_id,
          fromStatus: 'CALLED',
          toStatus: 'NO_SHOW',
          refreshCalledAt: false,
        });

        if (!updated) {
          throw new QueueError(
            409,
            'INVALID_STATE',
            'The ticket state has changed.',
          );
        }

        // Cập nhật phiếu và ghi sự kiện cùng một giao dịch.
        await appendEvent(client, {
          ticketId: updated.ticket_id,
          actorUserId: actor.userId,
          action: 'NO_SHOW',
          fromStatus: 'CALLED',
          toStatus: 'NO_SHOW',
        });

        return toTicketDto(updated);
      });
    },
  };
}