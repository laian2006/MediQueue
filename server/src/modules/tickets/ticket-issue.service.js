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
 * - db: shared pool from server/src/shared/db/pool.js.
 * - withTransaction(pool, fn): server/src/shared/db/transaction.js (Trực, 1.19).
 * - appendTicketEvent(client, event): server/src/modules/audit/append-ticket-event.js (Trực, 1.19).
 * - patientAccess: Hưng's createPatientAccessService(...).
 * Gửi lại cùng requestId (WBS 2.7) trả lại phiếu đã lưu thay vì cấp số mới.
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

  // Same retry key: same patient and session replays the stored ticket; anything else is a conflict.
  function replayOrConflict(existing, sessionId, patientId) {
    if (existing.session_id === sessionId && existing.patient_id === patientId) {
      return { ticket: toTicketDto(existing), replayed: true };
    }
    throw new TicketError(409, 'IDEMPOTENCY_CONFLICT', 'requestId đã được dùng cho một yêu cầu khác.');
  }

  /**
   * Returns { ticket, replayed }. replayed=false: a new ticket (HTTP 201).
   * replayed=true: the ticket stored for this (sender, requestId), in its CURRENT state (HTTP 200),
   * even if it was cancelled/ended or the session is closed. A replay allocates no number and
   * writes no TicketEvent. Access is always checked first, so a retry never reads outside access.
   */
  async function issueWithStatus(actor, input) {
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

    // WBS 2.7: the retry key is looked up over the whole history, BEFORE the OPEN check.
    const stored = await readRepository.findByRequestKey(actor.userId, requestId);
    if (stored) return replayOrConflict(stored, sessionId, patientId);

    try {
      return await withTransaction(db, async (client) => {
        const repository = createRepository(client);
        const session = await repository.lockSession(sessionId);
        if (!session) throw new TicketError(404, 'NOT_FOUND', 'Không tìm thấy phiên.');

        // A concurrent retry for the same session committed while we waited for the lock.
        const raced = await repository.findByRequestKey(actor.userId, requestId);
        if (raced) return replayOrConflict(raced, sessionId, patientId);

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
        return { ticket: toTicketDto(ticket), replayed: false };
      });
    } catch (error) {
      if (error instanceof TicketError) throw error;
      // Defensive: the session lock already serialises issuing, the index is the last guard.
      if (isUniqueViolation(error, 'uq_tickets_active_patient')) {
        throw await activeTicketExists(sessionId, patientId);
      }
      if (isUniqueViolation(error, 'uq_tickets_request')) {
        // Same key raced in through another session's lock: the transaction rolled back, read the winner.
        const winner = await readRepository.findByRequestKey(actor.userId, requestId);
        if (winner) return replayOrConflict(winner, sessionId, patientId);
      }
      // Unexpected DB errors go to the shared error handler, never to the client.
      throw error;
    }
  }

  return {
    issueWithStatus,
    // Kept for existing callers (queue tests, 1.7): resolves to the Ticket DTO only.
    async issue(actor, input) {
      return (await issueWithStatus(actor, input)).ticket;
    },
  };
}
