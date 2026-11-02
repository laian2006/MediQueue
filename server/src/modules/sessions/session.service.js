import { toSessionDto } from './session.dto.js';
import { SessionError } from './session.errors.js';

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

export function createSessionService({ repository }) {
  return {
    async getCurrent(actor) {
      requireActor(actor);
      return toSessionDto(await repository.findCurrent());
    },

    async open(actor) {
      requireActor(actor);
      if (actor.role !== 'STAFF') {
        throw new SessionError(403, 'FORBIDDEN', 'Chỉ nhân viên được mở phiên.');
      }

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
