import { sendError } from './send-error.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function destroySession(req) {
  return new Promise((resolve) => {
    if (typeof req.session?.destroy !== 'function') return resolve();
    // Phiên đã không hợp lệ; lỗi khi hủy không được che mất phản hồi 401.
    req.session.destroy(() => resolve());
  });
}

/**
 * Middleware xác định người gửi từ phiên phía server (cookie mediqueue.sid).
 * Thành công: req.user = { userId, role, displayName }, lấy từ DB — không lấy từ body/query/header.
 * Thiếu phiên, hết hạn tuyệt đối hoặc user không còn tồn tại: 401 UNAUTHENTICATED.
 * Cần express-session chạy trước. userRepository cần findById(userId).
 */
export function createAuthenticate({ userRepository, now = () => new Date() }) {
  if (typeof userRepository?.findById !== 'function') {
    throw new TypeError('userRepository.findById is required.');
  }

  return async function authenticate(req, res, next) {
    try {
      const userId = req.session?.userId;
      if (typeof userId !== 'string' || !UUID.test(userId)) {
        return sendError(res, 401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập.');
      }

      // Hết hạn tuyệt đối: kiểm tra lại ở đây, không phụ thuộc cách store gia hạn bản ghi.
      const expiresAt = Date.parse(req.session.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= now().getTime()) {
        await destroySession(req);
        return sendError(res, 401, 'UNAUTHENTICATED', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      }

      const user = await userRepository.findById(userId);
      if (!user) {
        await destroySession(req);
        return sendError(res, 401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập.');
      }

      req.user = { userId: user.user_id, displayName: user.display_name, role: user.role };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
