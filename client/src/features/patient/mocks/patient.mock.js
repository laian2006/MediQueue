// Chỉ dùng cho UI mock của task 1.13. Không gọi API hoặc lưu PostgreSQL.
const sessionId = '20000000-0000-4000-8000-000000000001';

const patients = [
  { patientId: '10000000-0000-4000-8000-000000000001', code: 'P001', displayName: 'Người bệnh mô phỏng 01' },
  { patientId: '10000000-0000-4000-8000-000000000002', code: 'P002', displayName: 'Người bệnh mô phỏng 02' },
  { patientId: '10000000-0000-4000-8000-000000000003', code: 'P003', displayName: 'Người bệnh mô phỏng 03' },
];

const session = {
  sessionId,
  status: 'OPEN',
  lastIssuedNumber: 12,
  openedAt: '2026-11-02T01:00:00.000Z',
  stoppedAt: null,
  closedAt: null,
};

// Số và trạng thái là fixture cố định để xem UI, không phải thuật toán cấp số.
const ticketViews = [
  {
    ticket: {
      ticketId: '30000000-0000-4000-8000-000000000001',
      sessionId,
      patientId: patients[0].patientId,
      number: 12,
      status: 'WAITING',
      lastCalledAt: null,
      createdAt: '2026-11-02T01:15:00.000Z',
      updatedAt: '2026-11-02T01:15:00.000Z',
    },
    waitingAhead: 2,
  },
  null,
  {
    ticket: {
      ticketId: '30000000-0000-4000-8000-000000000003',
      sessionId,
      patientId: patients[2].patientId,
      number: 7,
      status: 'CALLED',
      lastCalledAt: '2026-11-02T01:20:00.000Z',
      createdAt: '2026-11-02T01:05:00.000Z',
      updatedAt: '2026-11-02T01:20:00.000Z',
    },
    waitingAhead: null,
  },
];

const issuedView = {
  ticket: {
    ...ticketViews[0].ticket,
    ticketId: '30000000-0000-4000-8000-000000000002',
    patientId: patients[1].patientId,
    number: 13,
  },
  waitingAhead: 3,
};

// Test/preview có thể chọn từng trạng thái mà không thêm nút debug vào UI.
export function createPatientMockApi({ scenario = 'default', delay = 250 } = {}) {
  const views = new Map(patients.map((patient, index) => [patient.patientId, structuredClone(ticketViews[index])]));

  function response(data, fail = false) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (fail) {
          reject(new Error('Không tải được dữ liệu mô phỏng. Vui lòng thử lại.'));
        } else {
          resolve({ data: structuredClone(data) });
        }
      }, delay);
    });
  }

  return {
    getPatients: () => response(scenario === 'empty-patients' ? [] : patients, scenario === 'patients-error'),
    getCurrentSession: () => response(scenario === 'no-session' ? null : {
      ...session,
      status: scenario === 'stopped-session' ? 'STOPPED' : 'OPEN',
    }),
    getActiveTicket: ({ patientId }) => response(views.get(patientId) ?? null, scenario === 'ticket-error'),
    issueTicket: ({ patientId }) => {
      // P002 là hồ sơ chưa có phiếu trong fixture; chỉ mô phỏng phản hồi thành công.
      if (scenario === 'issue-error') return response(null, true);
      const view = views.get(patientId) ?? structuredClone(issuedView);
      views.set(patientId, view);
      return response(view);
    },
  };
}

export const patientMockApi = createPatientMockApi();
