import { toTicketView } from './ticket.dto.js';
import { TicketError } from './ticket.errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE_QUERY_FIELDS = ['patientId', 'sessionId'];

function requireRepresentative(actor) {
  // Only the trusted authentication middleware may populate this actor.
  if (!actor || typeof actor.userId !== 'string' || !UUID.test(actor.userId)) {
    throw new TicketError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập.');
  }
  if (actor.role !== 'REPRESENTATIVE') {
    throw new TicketError(403, 'FORBIDDEN', 'Chỉ người đại diện được xem phiếu riêng.');
  }
}

/**
 * Đọc phiếu riêng (WBS 1.8).
 * - createRepository(db): ticket repository factory; reads use the shared pool.
 * - patientAccess: Hưng's createPatientAccessService(...).
 * Quyền luôn kiểm tra theo patientId của phiếu, không theo người đã lấy số.
 */
export function createTicketQueryService({ db, createRepository, patientAccess }) {
  if (typeof createRepository !== 'function') throw new TypeError('createRepository is required.');
  if (typeof patientAccess?.assertCanAccessPatient !== 'function') {
    throw new TypeError('patientAccess.assertCanAccessPatient is required.');
  }
  const repository = createRepository(db);

  async function assertAccess(actor, patientId) {
    try {
      await patientAccess.assertCanAccessPatient(actor, patientId);
    } catch (error) {
      if (Number.isInteger(error?.statusCode) && typeof error.code === 'string') {
        throw new TicketError(error.statusCode, error.code, error.message);
      }
      throw error;
    }
  }

  return {
    async getById(actor, ticketId) {
      requireRepresentative(actor);
      if (typeof ticketId !== 'string' || !UUID.test(ticketId)) {
        throw new TicketError(400, 'VALIDATION_ERROR', 'ticketId phải là UUID.');
      }
      const row = await repository.findViewById(ticketId.toLowerCase());
      if (!row) throw new TicketError(404, 'NOT_FOUND', 'Không tìm thấy phiếu.');
      // No field of the ticket leaves the service before this check passes.
      await assertAccess(actor, row.patient_id);
      return toTicketView(row);
    },

    async getActive(actor, query) {
      requireRepresentative(actor);
      const valid = query !== null && typeof query === 'object'
        && Object.keys(query).sort().join() === ACTIVE_QUERY_FIELDS.join()
        && ACTIVE_QUERY_FIELDS.every((field) => typeof query[field] === 'string' && UUID.test(query[field]));
      if (!valid) {
        throw new TicketError(400, 'VALIDATION_ERROR', 'Cần đúng hai tham số patientId, sessionId dạng UUID.');
      }
      const patientId = query.patientId.toLowerCase();
      const sessionId = query.sessionId.toLowerCase();
      // Access is checked before any ticket query, so an outsider cannot probe for active tickets.
      await assertAccess(actor, patientId);
      const row = await repository.findActiveView(sessionId, patientId);
      return row ? toTicketView(row) : null;
    },
  };
}
