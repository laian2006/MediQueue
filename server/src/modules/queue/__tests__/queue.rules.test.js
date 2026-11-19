import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TICKET_STATUS,
  QueueRuleError,
  canTransition,
  isCounterBusy,
  selectNextWaitingTicket,
} from '../queue.rules.js';

const SESSION_A = '10000000-0000-4000-8000-000000000001';
const SESSION_B = '10000000-0000-4000-8000-000000000002';

// Tạo dữ liệu phiếu giả lập, không phải bản ghi trong cơ sở dữ liệu.
// Mã phiếu chỉ dùng để phân biệt các đối tượng trong kiểm thử.
function ticket(number, status = 'WAITING', sessionId = SESSION_A) {
  return {
    ticket_id: `${sessionId}:${number}`,
    session_id: sessionId,
    number,
    status,
  };
}

test('FIFO selects the lowest number regardless of array order', () => {
  const rows = [
    ticket(10),
    ticket(8),
    ticket(2),
    ticket(5),
  ];

  assert.equal(
    selectNextWaitingTicket(rows, SESSION_A),
    rows[2],
  );
});

test('FIFO skips completed, cancelled and no-show tickets', () => {
  const rows = [
    ticket(1, 'COMPLETED'),
    ticket(2, 'CANCELLED'),
    ticket(3, 'NO_SHOW'),
    ticket(8),
  ];

  assert.equal(
    selectNextWaitingTicket(rows, SESSION_A),
    rows[3],
  );
});

test('Tickets from another session do not affect selection or counter occupancy', () => {
  const rows = [
    ticket(1, 'WAITING', SESSION_B),
    ticket(2, 'CALLED', SESSION_B),
    ticket(8),
  ];

  assert.equal(isCounterBusy(rows, SESSION_A), false);

  assert.equal(
    selectNextWaitingTicket(rows, SESSION_A),
    rows[2],
  );
});

test('An empty queue returns null and leaves the counter idle', () => {
  const cases = [
    [],
    [
      ticket(1, 'COMPLETED'),
      ticket(2, 'CANCELLED'),
    ],
    [
      ticket(1, 'WAITING', SESSION_B),
    ],
  ];

  for (const rows of cases) {
    assert.equal(
      selectNextWaitingTicket(rows, SESSION_A),
      null,
    );

    assert.equal(
      isCounterBusy(rows, SESSION_A),
      false,
    );
  }
});

test('Selection does not mutate input rows or array order', () => {
  // Đóng băng dữ liệu để phát hiện việc sửa đầu vào ngoài ý muốn.
  const rows = Object.freeze([
    Object.freeze(ticket(10)),
    Object.freeze(ticket(2)),
  ]);

  assert.equal(
    selectNextWaitingTicket(rows, SESSION_A),
    rows[1],
  );

  assert.deepEqual(
    rows.map((row) => row.number),
    [10, 2],
  );

  assert.ok(
    rows.every((row) => row.status === 'WAITING'),
  );
});

// Cả hai trạng thái đều phải ngăn gọi thêm một phiếu.
for (const status of ['CALLED', 'REGISTERING']) {
  test(`${status} blocks selection with or without waiting tickets`, () => {
    const cases = [
      [
        ticket(1, status),
      ],
      [
        ticket(1, status),
        ticket(2),
      ],
    ];

    for (const rows of cases) {
      assert.equal(
        isCounterBusy(rows, SESSION_A),
        true,
      );

      assert.throws(
        () => selectNextWaitingTicket(rows, SESSION_A),
        (error) => error instanceof QueueRuleError
          && error.code === 'COUNTER_BUSY',
      );
    }
  });
}

// Tập cạnh hợp lệ được khai báo độc lập với mã triển khai.
const allowedEdges = new Set([
  'WAITING:CALLED',
  'WAITING:CANCELLED',
  'CALLED:CALLED',
  'CALLED:REGISTERING',
  'CALLED:NO_SHOW',
  'REGISTERING:COMPLETED',
]);

// Kiểm tra toàn bộ 36 cặp của 6 trạng thái,
// bao gồm mọi chuyển tiếp bị cấm từ trạng thái kết thúc.
for (const from of Object.values(TICKET_STATUS)) {
  for (const to of Object.values(TICKET_STATUS)) {
    test(`State transition: ${from} -> ${to}`, () => {
      const expected = allowedEdges.has(`${from}:${to}`);

      assert.equal(
        canTransition(from, to),
        expected,
      );
    });
  }
}

test('Unknown statuses are rejected', () => {
  const invalidStatuses = [
    'UNKNOWN',
    'waiting',
    'toString',
    '__proto__',
    '',
    null,
    undefined,
    {},
  ];

  for (const status of invalidStatuses) {
    assert.equal(
      canTransition(status, 'CALLED'),
      false,
    );

    assert.equal(
      canTransition('CALLED', status),
      false,
    );
  }
});

test('Invalid input is rejected', () => {
  for (const fn of [isCounterBusy, selectNextWaitingTicket]) {
    assert.throws(
      () => fn(null, SESSION_A),
      TypeError,
    );

    assert.throws(
      () => fn([], ''),
      TypeError,
    );

    assert.throws(
      () => fn([null], SESSION_A),
      TypeError,
    );

    assert.throws(
      () => fn([ticket(1, 'UNKNOWN')], SESSION_A),
      TypeError,
    );
  }

  // Số thứ tự phải là số nguyên dương, không phải chuỗi hiển thị.
  for (const number of ['2', 0, -1, 1.5, NaN, Infinity]) {
    assert.throws(
      () => selectNextWaitingTicket(
        [ticket(number)],
        SESSION_A,
      ),
      TypeError,
    );
  }
});