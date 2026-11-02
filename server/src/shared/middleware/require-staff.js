import { sendError } from './send-error.js';

// Dùng SAU authenticate. Chỉ STAFF được qua; REPRESENTATIVE bị 403.
export function requireStaff(req, res, next) {
  if (!req.user) return sendError(res, 401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập.');
  if (req.user.role !== 'STAFF') {
    return sendError(res, 403, 'FORBIDDEN', 'Chỉ nhân viên được thực hiện thao tác này.');
  }
  return next();
}
