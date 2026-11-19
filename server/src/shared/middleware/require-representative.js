import { sendError } from './send-error.js';

// Dùng SAU authenticate. Chỉ REPRESENTATIVE được qua; STAFF bị 403.
// Quyền theo hồ sơ (patientId) vẫn do patient-access.service.js kiểm tra trong từng nghiệp vụ.
export function requireRepresentative(req, res, next) {
  if (!req.user) return sendError(res, 401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập.');
  if (req.user.role !== 'REPRESENTATIVE') {
    return sendError(res, 403, 'FORBIDDEN', 'Chỉ người đại diện được thực hiện thao tác này.');
  }
  return next();
}
