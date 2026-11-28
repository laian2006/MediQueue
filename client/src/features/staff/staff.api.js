import { http } from '../../shared/api/http.js';

// Cùng phương thức với mocks/staff.mock.js; lỗi là ApiError của http.js, UI đọc error.code.
export function createStaffApi(client = http) {
  const query = (sessionId) => new URLSearchParams({ sessionId });
  // 2.10: thao tác theo ticketId trên đường dẫn, máy chủ từ chối mọi body/query.
  const ticketAction = (action) => ({ ticketId }, options) =>
    client.post(`/queue/tickets/${encodeURIComponent(ticketId)}/${action}`, undefined, options);
  return {
    getCurrentSession: (options) => client.get('/sessions/current', options),
    getWaitingQueue: ({ sessionId }, options) => client.get(`/queue/waiting?${query(sessionId)}`, options),
    getCurrentQueue: ({ sessionId }, options) => client.get(`/queue/current?${query(sessionId)}`, options),
    callNext: ({ sessionId }, options) => client.post('/queue/call-next', { sessionId }, options),
    recall: ticketAction('recall'),
    start: ticketAction('start'),
    complete: ticketAction('complete'),
    // 2.17: ghi vắng (2.11), cùng quy ước không body.
    noShow: ticketAction('no-show'),
  };
}

export const staffApi = createStaffApi();
