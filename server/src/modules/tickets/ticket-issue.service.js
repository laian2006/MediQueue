import { toTicketDto } from './ticket.dto.js';
import { TicketError } from './ticket.errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INPUT_FIELDS = ['patientId', 'requestId', 'sessionId'];

// Issuing in a STOPPED/CLOSED session: 409 INVALID_STATE, as decided by An on 04/11/2026.
export const SESSION_NOT_OPEN_CODE = 'INVALID_STATE';

function requireRepresentative(actor) {
  // Only the trusted authentication middleware may populate this actor.
  if (!actor || typeof actor.userId !== 'string' || !UUID.test(actor.userId)) {
    throw new TicketError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập.');
  }
  if (actor.role !== 'REPRESENTATIVE') {
    throw new TicketError(403, 'FORBIDDEN', 'Chỉ người đại diện được lấy số.');
  }
}

function parseInput(input) {
  const valid = input !== null && typeof input === 'object' && !Array.isArray(input)
    && Object.keys(input).sort().join() === INPUT_FIELDS.join()
    && INPUT_FIELDS.every((field) => typeof input[field] === 'string' && UUID.test(input[field]));
  if (!valid) {
    throw new TicketError(400, 'VALIDATION_ERROR',
      'Cần đúng ba trường patientId, sessionId, requestId dạng UUID.');
  }
  // Canonical lower-case UUIDs so the retry key compares equal regardless of client casing.
  return {
    patientId: input.patientId.toLowerCase(),
    sessionId: input.sessionId.toLowerCase(),
    requestId: input.requestId.toLowerCase(),
  };
}

const isUniqueViolation = (error, constraint) => error?.code === '23505' && error.constraint === constraint;

/**
 * Cấp số nền (WBS 1.7).
 * - db: shared pool (reads outside the transaction).
 * - withTransaction(fn): Trực's shared transaction helper; runs fn(client), commits or rolls back.
 * - appendTicketEvent(client, event): Trực's TicketEvent helper; must not commit on its own.
 * - patientAccess: Hưng's createPatientAccessService(...).
 * Gửi lại cùng requestId trả phiếu cũ thuộc WBS 2.7; ở 1.7 khóa trùng chỉ được báo 409.
 */
export function createTicketIssueService({
  db, withTransaction, createRepository, patientAccess, appendTicketEvent,
}) {
  for (const [name, value] of Object.entries({ withTransaction, createRepository, appendTicketEvent })) {
    if (typeof value !== 'function') throw new TypeError(`${name} is required.`);
  }
  if (typeof patientAccess?.assertCanAccessPatient !== 'function') {
    throw new TypeError('patientAccess.assertCanAccessPatient is required.');
  }
  const readRepository = createRepository(db);

  async function activeTicketExists(sessionId, patientId) {
    const active = await readRepository.findActiveForPatient(sessionId, patientId);
    return new TicketError(409, 'ACTIVE_TICKET_EXISTS', 'Hồ sơ đã có phiếu đang hoạt động trong phiên.',
      active ? { ticketId: active.ticket_id } : undefined);
  }

  return {
    async issue(actor, input) {
      requireRepresentative(actor);
      const { patientId, sessionId, requestId } = parseInput(input);

      try {
        await patientAccess.assertCanAccessPatient(actor, patientId);
      } catch (error) {
        if (Number.isInteger(error?.statusCode) && typeof error.code === 'string') {
          throw new TicketError(error.statusCode, error.code, error.message);
        }
        throw error;
      }

      try {
        const row = await withTransaction(async (client) => {
          const repository = createRepository(client);
          const session = await repository.lockSession(sessionId);
          if (!session) throw new TicketError(404, 'NOT_FOUND', 'Không tìm thấy phiên.');
          if (session.status !== 'OPEN') {
            throw new TicketError(409, SESSION_NOT_OPEN_CODE, 'Phiên không nhận số mới.');
          }

          const active = await repository.findActiveForPatient(sessionId, patientId);
          if (active) {
            throw new TicketError(409, 'ACTIVE_TICKET_EXISTS', 'Hồ sơ đã có phiếu đang hoạt động trong phiên.',
              { ticketId: active.ticket_id });
          }

          const number = await repository.allocateNumber(sessionId);
          if (number === null) {
            // The lock makes this unreachable unless the session changed outside the lock order.
            throw new TicketError(409, SESSION_NOT_OPEN_CODE, 'Phiên không nhận số mới.');
          }
          const ticket = await repository.insertWaiting({
            sessionId, patientId, issuedByUserId: actor.userId, requestId, number,
          });
          await appendTicketEvent(client, {
            ticketId: ticket.ticket_id,
            actorUserId: actor.userId,
            action: 'ISSUED',
            fromStatus: null,
            toStatus: 'WAITING',
          });
          return ticket;
        });
        return toTicketDto(row);
      } catch (error) {
        if (error instanceof TicketError) throw error;
        // Defensive: the session lock already serialises issuing, the index is the last guard.
        if (isUniqueViolation(error, 'uq_tickets_active_patient')) {
          throw await activeTicketExists(sessionId, patientId);
        }
        if (isUniqueViolation(error, 'uq_tickets_request')) {
          // Sprint 1 only. WBS 2.7 replaces this with replaying the stored ticket.
          throw new TicketError(409, 'IDEMPOTENCY_CONFLICT', 'requestId đã được dùng cho một yêu cầu khác.');
        }
        // Unexpected DB errors go to the shared error handler, never to the client.
        throw error;
      }
    },
  };
}
