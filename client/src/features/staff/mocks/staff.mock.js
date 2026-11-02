// Chỉ dùng cho UI mock của task 1.16. Không gọi API hoặc lưu PostgreSQL.
const sessionId = '20000000-0000-4000-8000-000000000001';
const serverTime = '2026-11-02T02:05:00.000Z';
const noShowTimeoutSeconds = 60;

const session = {
  sessionId,
  status: 'OPEN',
  lastIssuedNumber: 7,
  openedAt: '2026-11-02T01:00:00.000Z',
  stoppedAt: null,
  closedAt: null,
};

function ticket(number, status, lastCalledAt = null) {
  return {
    ticketId: `30000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
    sessionId,
    patientId: `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
    number,
    status,
    lastCalledAt,
    createdAt: `2026-11-02T01:${String(number * 5).padStart(2, '0')}:00.000Z`,
    updatedAt: lastCalledAt ?? `2026-11-02T01:${String(number * 5).padStart(2, '0')}:00.000Z`,
  };
}

const waitingTickets = () => [ticket(5, 'WAITING'), ticket(6, 'WAITING'), ticket(7, 'WAITING')];
const activeTicket = (status) => ticket(4, status, '2026-11-02T02:03:30.000Z');

// Trạng thái ban đầu của từng scenario. Số là fixture, không phải thuật toán FIFO.
const fixtures = {
  default: () => ({ current: null, waiting: waitingTickets() }),
  called: () => ({ current: activeTicket('CALLED'), waiting: waitingTickets() }),
  registering: () => ({ current: activeTicket('REGISTERING'), waiting: waitingTickets() }),
  'empty-queue': () => ({ current: null, waiting: [] }),
};

function apiError(code, message, status = 409) {
  return Object.assign(new Error(message), { status, code });
}

// Test/preview có thể chọn từng trạng thái mà không thêm nút debug vào UI.
export function createStaffMockApi({ scenario = 'default', delay = 250 } = {}) {
  const state = (fixtures[scenario] ?? fixtures.default)();
  let failReads = scenario === 'load-error';

  function response(read, error = null) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (error) reject(error);
        else resolve({ data: structuredClone(read()) });
      }, delay);
    });
  }

  const readError = () => (failReads ? new Error('Không tải được dữ liệu mô phỏng.') : null);

  return {
    getCurrentSession: () => response(() => {
      if (scenario === 'no-session') return null;
      return {
        ...session,
        status: scenario === 'stopped-session' ? 'STOPPED' : 'OPEN',
        stoppedAt: scenario === 'stopped-session' ? '2026-11-02T02:00:00.000Z' : null,
      };
    }, readError()),
    getWaitingQueue: () => response(() => ({ tickets: state.waiting }), readError()),
    getCurrentQueue: () => response(() => ({
      ticket: state.current,
      noShowTimeoutSeconds,
      serverTime,
    }), readError()),
    callNext: () => {
      if (scenario === 'call-error') {
        return response(null, new Error('Mất kết nối mô phỏng.'));
      }
      if (scenario === 'call-error-then-offline') {
        failReads = true;
        return response(null, new Error('Mất kết nối mô phỏng.'));
      }
      if (scenario === 'counter-busy') {
        // Mô phỏng cửa sổ khác vừa gọi trước khi yêu cầu này tới máy chủ.
        state.current = { ...state.waiting.shift(), status: 'CALLED', lastCalledAt: serverTime };
        return response(null, apiError('COUNTER_BUSY', 'Quầy đang bận.'));
      }
      if (scenario === 'queue-empty') {
        // Mô phỏng các phiếu vừa bị hủy trước khi yêu cầu này tới máy chủ.
        state.waiting = [];
        return response(null, apiError('QUEUE_EMPTY', 'Hàng chờ rỗng.'));
      }
      if (scenario === 'invalid-state') {
        return response(null, apiError('INVALID_STATE', 'Trạng thái không hợp lệ.'));
      }
      const [next, ...rest] = state.waiting;
      state.waiting = rest;
      state.current = { ...next, status: 'CALLED', lastCalledAt: serverTime, updatedAt: serverTime };
      return response(() => state.current);
    },
  };
}

export const staffMockApi = createStaffMockApi();
