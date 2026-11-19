import { Router } from 'express';
import { PatientError } from './patient.errors.js';
import { sendError } from '../../shared/middleware/send-error.js';

/**
 * GET /patients (WBS 1.5): hồ sơ người gửi được cấp quyền.
 * userId lấy từ req.user (phiên phía server), không nhận từ query/body/header.
 */
export function createPatientRouter({ patientAccessService, authenticate, requireRepresentative }) {
  if (typeof requireRepresentative !== 'function') {
    throw new TypeError('Shared requireRepresentative middleware is required.');
  }
  // Không có chế độ bỏ qua xác thực: thiếu middleware thì lỗi ngay khi khởi động.
  if (typeof authenticate !== 'function') {
    throw new TypeError('Shared authenticate middleware is required.');
  }
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/', authenticate, requireRepresentative, async (req, res, next) => {
    try {
      const data = await patientAccessService.listPatients(req.user);
      res.status(200).json({ data });
    } catch (error) {
      if (error instanceof PatientError) {
        return sendError(res, error.statusCode, error.code, error.message);
      }
      return next(error);
    }
  });

  return router;
}
