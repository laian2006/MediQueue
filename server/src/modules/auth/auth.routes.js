import { Router } from 'express';
import { AuthError } from './auth.errors.js';
import { SESSION_COOKIE_NAME } from '../../shared/config/session.config.js';

function handle(operation) {
  return async (req, res, next) => {
    try {
      await operation(req, res);
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json({
          error: { code: error.code, message: error.message },
        });
      }
      next(error);
    }
  };
}

const callbackToPromise = (fn) => new Promise((resolve, reject) => fn((error) => (error ? reject(error) : resolve())));

// Đăng nhập luôn tạo định danh phiên MỚI (chống session fixation).
async function establishSession(req, userId, expiresAt) {
  if (typeof req.session?.regenerate !== 'function') {
    throw new Error('Session middleware must be registered before the auth router.');
  }
  await callbackToPromise((done) => req.session.regenerate(done));
  req.session.userId = userId;
  req.session.expiresAt = expiresAt.toISOString();
  req.session.cookie.expires = expiresAt; // cookie hết hạn đúng lúc phiên hết hạn tuyệt đối
  await callbackToPromise((done) => req.session.save(done));
}

export function createAuthRouter({ authService, authenticate }) {
  // Không có chế độ bỏ qua xác thực: thiếu middleware thì lỗi ngay khi khởi động.
  if (typeof authenticate !== 'function') {
    throw new TypeError('Shared authenticate middleware is required.');
  }
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.post('/login', handle(async (req, res) => {
    if (!req.is('application/json') || req.body === undefined) {
      throw new AuthError(400, 'VALIDATION_ERROR', 'Dữ liệu gửi kèm phải là JSON.');
    }
    const { user, expiresAt } = await authService.login(req.body);
    await establishSession(req, user.userId, expiresAt);
    res.status(200).json({ data: { user, expiresAt: expiresAt.toISOString() } });
  }));

  router.get('/me', authenticate, handle(async (req, res) => {
    const { userId, displayName, role } = req.user;
    res.status(200).json({ data: { userId, displayName, role } });
  }));

  // WBS 2.5: hủy phiên phía server rồi xóa cookie. Cần đăng nhập (401 nếu thiếu/đã hủy);
  // authenticate chạy trước nên người chưa đăng nhập luôn nhận 401, không phải 400.
  router.post('/logout', authenticate, handle(async (req, res) => {
    if (req.body !== undefined) {
      throw new AuthError(400, 'VALIDATION_ERROR', 'Đăng xuất không nhận dữ liệu gửi kèm.');
    }
    // Xóa bản ghi trong store: cookie cũ không còn dùng được kể cả khi kẻ khác đã sao chép nó.
    await callbackToPromise((done) => req.session.destroy(done));
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'lax' });
    res.status(200).json({ data: null });
  }));

  return router;
}
