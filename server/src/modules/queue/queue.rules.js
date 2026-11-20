// Quy tắc thuần, không trực tiếp đọc hoặc ghi cơ sở dữ liệu.
export const TICKET_STATUS = Object.freeze({
  WAITING: 'WAITING',
  CALLED: 'CALLED',
  REGISTERING: 'REGISTERING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
});

// Các chuyển trạng thái được phép theo thiết kế chung.
const transitions = Object.freeze({
  WAITING: Object.freeze(['CALLED', 'CANCELLED']),
  CALLED: Object.freeze(['CALLED', 'REGISTERING', 'NO_SHOW']),
  REGISTERING: Object.freeze(['COMPLETED']),
  COMPLETED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
  NO_SHOW: Object.freeze([]),
});

const knownStatuses = new Set(Object.values(TICKET_STATUS));

// Lỗi nghiệp vụ để phần API nhận biết ở bước tích hợp.
export class QueueRuleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'QueueRuleError';
    this.code = code;
  }
}

// Chỉ kiểm tra cạnh trong sơ đồ trạng thái.
// Service phải kiểm tra thêm quyền, thời gian T và điều kiện phiên.
// CALLED → CALLED biểu diễn thao tác gọi lại.
export function canTransition(fromStatus, toStatus) {
  if (
    !knownStatuses.has(fromStatus)
    || !knownStatuses.has(toStatus)
  ) {
    return false;
  }

  return transitions[fromStatus].includes(toStatus);
}

// Kiểm tra đầu vào và lấy các phiếu thuộc phiên đang xét.
// Dữ liệu sử dụng tên trường PostgreSQL dạng snake_case.
function ticketsForSession(tickets, sessionId) {
  if (!Array.isArray(tickets)) {
    throw new TypeError('tickets must be an array.');
  }

  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    throw new TypeError('sessionId must be a non-empty string.');
  }

  const rows = [];

  for (const ticket of tickets) {
    if (
      !ticket
      || typeof ticket !== 'object'
      || Array.isArray(ticket)
    ) {
      throw new TypeError(
        'Each ticket must be a PostgreSQL Ticket row.',
      );
    }

    if (ticket.session_id !== sessionId) {
      continue;
    }

    if (!knownStatuses.has(ticket.status)) {
      throw new TypeError('Unknown ticket status.');
    }

    rows.push(ticket);
  }

  return rows;
}

// Phiếu đang được gọi hoặc đang tiếp nhận sẽ chiếm quầy.
function occupiesCounter(ticket) {
  return ticket.status === TICKET_STATUS.CALLED
    || ticket.status === TICKET_STATUS.REGISTERING;
}

// Phải truyền cả phiếu CALLED và REGISTERING, không chỉ WAITING.
export function isCounterBusy(tickets, sessionId) {
  return ticketsForSession(tickets, sessionId).some(occupiesCounter);
}

// Chọn phiếu WAITING có số nhỏ nhất trong đúng phiên.
// Trả null nếu không có phiếu chờ, ném COUNTER_BUSY nếu quầy bận.
// Không sửa dữ liệu đầu vào và không giữ chỗ cho phiếu được chọn.
// Service tích hợp phải xử lý giao dịch và khóa để bảo đảm đồng thời.
export function selectNextWaitingTicket(tickets, sessionId) {
  const rows = ticketsForSession(tickets, sessionId);

  if (rows.some(occupiesCounter)) {
    throw new QueueRuleError(
      'COUNTER_BUSY',
      'The counter already has a called or registering ticket.',
    );
  }

  let next = null;

  for (const ticket of rows) {
    if (ticket.status !== TICKET_STATUS.WAITING) {
      continue;
    }

    if (!Number.isSafeInteger(ticket.number) || ticket.number < 1) {
      throw new TypeError(
        'WAITING ticket.number must be a positive safe integer.',
      );
    }

    if (next === null || ticket.number < next.number) {
      next = ticket;
    }
  }

  return next;
}

// Mỗi thao tác có một trạng thái nguồn và một sự kiện xác định.
const lifecycleTransitions = Object.freeze({
  recall: Object.freeze({
    fromStatus: 'CALLED',
    toStatus: 'CALLED',
    eventAction: 'RECALLED',
    refreshCalledAt: true,
  }),
  start: Object.freeze({
    fromStatus: 'CALLED',
    toStatus: 'REGISTERING',
    eventAction: 'STARTED',
    refreshCalledAt: false,
  }),
  complete: Object.freeze({
    fromStatus: 'REGISTERING',
    toStatus: 'COMPLETED',
    eventAction: 'COMPLETED',
    refreshCalledAt: false,
  }),
});

// Kiểm tra thao tác cụ thể, ngoài việc kiểm tra sơ đồ chuyển trạng thái.
export function getLifecycleTransition(action, currentStatus) {
  if (!Object.hasOwn(lifecycleTransitions, action)) {
    throw new TypeError('Unknown queue lifecycle action.');
  }

  const transition = lifecycleTransitions[action];

  if (
    currentStatus !== transition.fromStatus
    || !canTransition(currentStatus, transition.toStatus)
  ) {
    throw new QueueRuleError(
      'INVALID_STATE',
      'The ticket state does not allow this action.',
    );
  }

  return transition;
}