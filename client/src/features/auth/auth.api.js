import { http } from '../../shared/api/http.js';

// Đường dẫn ghép sau /api/v1 (http.js). Body login đúng hợp đồng: chỉ username và password.
export const authApi = {
  login: (username, password, options) => http.post('/auth/login', { username, password }, options),
  me: (options) => http.get('/auth/me', options),
};

// Dùng cho màn hình chọn hồ sơ của Đạt: trả { data: [{ patientId, code, displayName }] }.
export const patientsApi = {
  list: (options) => http.get('/patients', options),
};
