import { PatientError } from './patient.errors.js';
import { toPatientDto } from './patient.dto.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireRepresentative(actor) {
  if (!actor || typeof actor.userId !== 'string' || !UUID.test(actor.userId)) {
    throw new PatientError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập.');
  }
  // STAFF không tự có quyền đại diện mọi hồ sơ trong phạm vi này.
  if (actor.role !== 'REPRESENTATIVE') {
    throw new PatientError(403, 'FORBIDDEN', 'Chỉ người đại diện được truy cập hồ sơ người bệnh.');
  }
}

/**
 * Hàm kiểm tra quyền theo patientId chuẩn trong DB, dùng chung cho các mô đun khác.
 * actor là req.user do authenticate gán ({ userId, role }); không tin patientId/vai trò client tự khai.
 */
export function createPatientAccessService({ repository }) {
  return {
    /** Hồ sơ người gửi được cấp quyền (DTO: patientId, code, displayName). */
    async listPatients(actor) {
      requireRepresentative(actor);
      return (await repository.listForUser(actor.userId)).map(toPatientDto);
    },

    /** true/false; STAFF hoặc patientId sai định dạng → false (không truy vấn DB). */
    async canAccessPatient(actor, patientId) {
      if (!actor || typeof actor.userId !== 'string' || !UUID.test(actor.userId)) {
        throw new PatientError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập.');
      }
      if (actor.role !== 'REPRESENTATIVE') return false;
      if (typeof patientId !== 'string' || !UUID.test(patientId)) return false;
      return repository.hasAccess(actor.userId, patientId);
    },

    /** Ném 401/403/400 nếu không đủ quyền. Hồ sơ không tồn tại và hồ sơ ngoài quyền đều là 403. */
    async assertCanAccessPatient(actor, patientId) {
      requireRepresentative(actor);
      if (typeof patientId !== 'string' || !UUID.test(patientId)) {
        throw new PatientError(400, 'VALIDATION_ERROR', 'patientId không hợp lệ.');
      }
      if (!(await repository.hasAccess(actor.userId, patientId))) {
        throw new PatientError(403, 'FORBIDDEN', 'Bạn không có quyền với hồ sơ này.');
      }
    },
  };
}
