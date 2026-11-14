import { authApi } from '../auth/auth.api.js';
import { ApiError, http } from '../../shared/api/http.js';

export const sessionApi = {
  async getStaffCurrent(options) {
    const { data: user } = await authApi.me(options);
    if (user.role !== 'STAFF') {
      throw new ApiError('Chỉ nhân viên được quản lý phiên đăng ký.', { status: 403 });
    }
    const { data } = await http.get('/sessions/current', options);
    return data;
  },

  async open(options) {
    const { data } = await http.post('/sessions', undefined, options);
    return data;
  },
};
