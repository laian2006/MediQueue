import { toSessionDto } from './session.dto.js';
import { SessionError } from './session.errors.js';
import { createSessionRepository } from './session.repository.js';
import { withTransaction } from '../../shared/db/transaction.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireActor(actor) {
  // Only the trusted authentication middleware may populate this actor.
  if (!actor || typeof actor.userId !== 'string' || !UUID.test(actor.userId)) {
    throw new SessionError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập.');
  }
  if (!['STAFF', 'REPRESENTATIVE'].includes(actor.role)) {
    throw new SessionError(403, 'FORBIDDEN', 'Tài khoản không có quyền sử dụng.');
  }
}

function requireStaffActor(actor) {
  requireActor(actor);
  if (actor.role !== 'STAFF') {
    throw new SessionError(403, 'FORBIDDEN', 'Chỉ nhân viên được quản lý phiên.');
  }
}

export function createSessionService({ repository, pool }) {
  async function changeState(actor, sessionId, action) {
    requireStaffActor(actor);
    if (typeof sessionId !== 'string' || !UUID.test(sessionId)) {
      throw new SessionError(400, 'VALIDATION_ERROR', 'sessionId phải là UUID.');
    }
    // Same lock order as issuance, calling and cancellation: session first.
    return withTransaction(pool, async (client) => {
      const locked = createSessionRepository(client);
      const session = await locked.lockById(sessionId.toLowerCase());
      if (!session) throw new SessionError(404, 'NOT_FOUND', 'Không tìm thấy phiên.');
      if (action === 'stop') {
        if (session.status === 'CLOSED') {
          throw new SessionError(409, 'INVALID_STATE', 'Phiên đã đóng.');
        }
        if (session.status === 'STOPPED') return toSessionDto(session);
        return toSessionDto(await locked.stop(session.session_id, actor.userId));
      }
      if (session.status === 'CLOSED') return toSessionDto(session);
      if (session.status !== 'STOPPED') {
        throw new SessionError(409, 'INVALID_STATE', 'Cần ngừng cấp số trước khi đóng phiên.');
      }
      if (await locked.hasActiveTickets(session.session_id)) {
        throw new SessionError(409, 'ACTIVE_TICKETS_REMAIN', 'Còn phiếu đang chờ hoặc tiếp nhận. Hãy xử lý hết trước khi đóng phiên.');
      }
      return toSessionDto(await locked.close(session.session_id, actor.userId));
    });
  }

  return {
    stop: (actor, sessionId) => changeState(actor, sessionId, 'stop'),
    close: (actor, sessionId) => changeState(actor, sessionId, 'close'),
    async getCurrent(actor) {
      requireActor(actor);
      return toSessionDto(await repository.findCurrent());
    },

    async open(actor) {
      requireStaffActor(actor);

      try {
        return toSessionDto(await repository.insertOpen(actor.userId));
      } catch (error) {
        if (error.code === '23505' && error.constraint === 'uq_queue_sessions_single_active') {
          throw new SessionError(409, 'SESSION_ALREADY_ACTIVE', 'Đã có phiên chưa đóng.');
        }
        // Unexpected DB errors go to the shared error handler, never to the client.
        throw error;
      }
    },
  };
}
