import { toTicketView } from './ticket.dto.js';
import { TicketError } from './ticket.errors.js';
import { PatientError } from '../patients/patient.errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createTicketCancelService({ db, withTransaction, createRepository, patientAccess, appendTicketEvent }) {
  const readRepository = createRepository(db);

  return {
    async cancel(actor, ticketId) {
      if (!actor || typeof actor.userId !== 'string' || !UUID.test(actor.userId)) {
        throw new TicketError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập.');
      }
      if (actor.role !== 'REPRESENTATIVE') {
        throw new TicketError(403, 'FORBIDDEN', 'Chỉ người đại diện được hủy phiếu.');
      }
      if (typeof ticketId !== 'string' || !UUID.test(ticketId)) {
        throw new TicketError(400, 'VALIDATION_ERROR', 'ticketId phải là UUID.');
      }

      const location = await readRepository.findTicketLocation(ticketId);
      if (!location) throw new TicketError(404, 'NOT_FOUND', 'Không tìm thấy phiếu.');
      try {
        await patientAccess.assertCanAccessPatient(actor, location.patient_id);
      } catch (error) {
        if (error instanceof PatientError) throw new TicketError(error.statusCode, error.code, error.message);
        throw error;
      }

      return withTransaction(db, async (client) => {
        const repository = createRepository(client);
        const session = await repository.lockSession(location.session_id);
        if (!session || !['OPEN', 'STOPPED'].includes(session.status)) {
          throw new TicketError(409, 'INVALID_STATE', 'Phiên đã đóng, không thể hủy phiếu.');
        }
        // The conditional UPDATE locks the ticket after the session and rechecks WAITING.
        const cancelled = await repository.cancelWaiting(ticketId, location.session_id, location.patient_id);
        if (!cancelled) throw new TicketError(409, 'INVALID_STATE', 'Chỉ hủy được phiếu đang chờ.');

        await appendTicketEvent(client, {
          ticketId: cancelled.ticket_id,
          actorUserId: actor.userId,
          action: 'CANCELLED',
          fromStatus: 'WAITING',
          toStatus: 'CANCELLED',
        });
        return toTicketView(cancelled);
      });
    },
  };
}
