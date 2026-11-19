import { http } from '../../shared/api/http.js';

// Cùng phương thức với mocks/staff.mock.js; lỗi là ApiError của http.js, UI đọc error.code.
export function createStaffApi(client = http) {
  const query = (sessionId) => new URLSearchParams({ sessionId });
  return {
    getCurrentSession: (options) => client.get('/sessions/current', options),
    getWaitingQueue: ({ sessionId }, options) => client.get(`/queue/waiting?${query(sessionId)}`, options),
    getCurrentQueue: ({ sessionId }, options) => client.get(`/queue/current?${query(sessionId)}`, options),
    callNext: ({ sessionId }, options) => client.post('/queue/call-next', { sessionId }, options),
  };
}

export const staffApi = createStaffApi();
