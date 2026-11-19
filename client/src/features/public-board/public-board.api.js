import { http } from '../../shared/api/http.js';

export function createPublicBoardApi(client = http) {
  return {
    async getBoard({ signal } = {}) {
      const { data } = await client.get('/public/board', { signal });
      if (!data || !Array.isArray(data.waitingNumbers)
          || !data.waitingNumbers.every((n) => Number.isSafeInteger(n) && n > 0)
          || typeof data.updatedAt !== 'string' || !Number.isFinite(Date.parse(data.updatedAt))
          || (data.currentTicket !== null && (!data.currentTicket
            || !Number.isSafeInteger(data.currentTicket.number) || data.currentTicket.number < 1
            || !['CALLED', 'REGISTERING'].includes(data.currentTicket.status)))) {
        throw new Error('Phản hồi bảng gọi số không hợp lệ.');
      }
      return data;
    },
  };
}

export const publicBoardApi = createPublicBoardApi();
