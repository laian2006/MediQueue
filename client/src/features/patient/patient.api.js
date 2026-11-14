import { patientsApi } from '../auth/auth.api.js';
import { http } from '../../shared/api/http.js';

export const patientApi = {
  getPatients: patientsApi.list,
  getCurrentSession: (options) => http.get('/sessions/current', options),
  getActiveTicket: ({ patientId, sessionId }, options) => {
    const query = new URLSearchParams({ patientId, sessionId });
    return http.get(`/tickets/active?${query}`, options);
  },
  getTicket: (ticketId, options) => http.get(`/tickets/${encodeURIComponent(ticketId)}`, options),
  issueTicket: (body, options) => http.post('/tickets', body, options),
};
