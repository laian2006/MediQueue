import { useEffect, useRef, useState } from 'react';
import TicketCard from './components/TicketCard.jsx';
import { patientMockApi } from './mocks/patient.mock.js';
import './patient.css';

export default function PatientPage({ api = patientMockApi }) {
  const [patients, setPatients] = useState([]);
  const [session, setSession] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [ticketView, setTicketView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState('');
  const [ticketError, setTicketError] = useState('');
  const [reload, setReload] = useState(0);
  const pendingRequest = useRef(null);
  const submittingRef = useRef(false);
  const selectedPatient = patients.find((patient) => patient.patientId === selectedId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPageError('');
    setSelectedId('');
    setTicketView(null);
    pendingRequest.current = null;

    Promise.all([api.getPatients(), api.getCurrentSession()])
      .then(([patientResponse, sessionResponse]) => {
        if (cancelled) return;
        setPatients(patientResponse.data);
        setSession(sessionResponse.data);
      })
      .catch(() => {
        if (!cancelled) setPageError('Không tải được danh sách hồ sơ và phiên đăng ký. Vui lòng thử lại.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [api, reload]);

  useEffect(() => {
    let cancelled = false;
    setTicketView(null);
    setTicketError('');
    if (!selectedId || !session) {
      setTicketLoading(false);
      return;
    }

    setTicketLoading(true);
    api.getActiveTicket({ patientId: selectedId, sessionId: session.sessionId })
      .then((response) => { if (!cancelled) setTicketView(response.data); })
      .catch(() => { if (!cancelled) setTicketError('Không tải được phiếu của hồ sơ này. Vui lòng thử lại.'); })
      .finally(() => { if (!cancelled) setTicketLoading(false); });

    return () => { cancelled = true; };
  }, [api, selectedId, session, reload]);

  function selectPatient(event) {
    if (submittingRef.current) return;
    setSelectedId(event.target.value);
    setTicketView(null);
    setTicketError('');
    setTicketLoading(Boolean(event.target.value && session));
    pendingRequest.current = null;
  }

  async function issueTicket() {
    if (submittingRef.current || ticketLoading || ticketView || !selectedPatient || session?.status !== 'OPEN') return;
    submittingRef.current = true;
    setSubmitting(true);
    setTicketError('');
    // Một lần thử lại giữ nguyên body; nối http.js/API thật thuộc task 1.14.
    pendingRequest.current ??= {
      patientId: selectedId,
      sessionId: session.sessionId,
      requestId: crypto.randomUUID(),
    };
    try {
      const response = await api.issueTicket(pendingRequest.current);
      setTicketView(response.data);
      pendingRequest.current = null;
    } catch {
      setTicketError('Chưa nhận được xác nhận lấy số. Vui lòng thử lại cùng thao tác.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const canIssue = selectedPatient && session?.status === 'OPEN'
    && !loading && !ticketLoading && !submitting && !ticketView && !pageError && !ticketError;

  return (
    <main className="patient-page">
      <header className="patient-header">
        <a className="patient-brand" href="#patient-content" aria-label="MediQueue, đến nội dung chính">MediQueue<span>Đăng ký ngoại trú</span></a>
        <span className="patient-demo-label">Bản xem thử · Dữ liệu mô phỏng</span>
      </header>

      <div className="patient-content" id="patient-content">
        <div className="patient-intro">
          <p className="patient-kicker">Dành cho người bệnh và người đại diện</p>
          <h1>Lấy số và theo dõi lượt đăng ký</h1>
          <p>Chọn đúng hồ sơ để xem số thứ tự và trạng thái tại quầy.</p>
        </div>

        {loading ? <p className="patient-notice" role="status">Đang tải hồ sơ và phiên đăng ký…</p> : pageError ? (
          <div className="patient-notice patient-notice--error" role="alert">
            <p>{pageError}</p>
            <button className="patient-button patient-button--secondary" onClick={() => setReload(reload + 1)}>Thử tải lại</button>
          </div>
        ) : (
          <div className="patient-layout">
            <section className="patient-panel" aria-labelledby="patient-profile-heading">
              <p className="patient-step">Bước 1</p>
              <h2 id="patient-profile-heading">Chọn hồ sơ người bệnh</h2>
              <p className="patient-muted">Chỉ sử dụng các hồ sơ đã được cấp quyền đại diện.</p>
              {patients.length === 0 ? (
                <p className="patient-notice" role="status">Bạn chưa có hồ sơ được cấp quyền. Vui lòng liên hệ người phụ trách tài khoản.</p>
              ) : (
                <>
                  <label className="patient-label" htmlFor="patient-profile">Hồ sơ người bệnh</label>
                  <select id="patient-profile" value={selectedId} onChange={selectPatient} disabled={submitting}>
                    <option value="">Chọn một hồ sơ</option>
                    {patients.map((patient) => <option key={patient.patientId} value={patient.patientId}>{patient.code} — {patient.displayName}</option>)}
                  </select>
                  {selectedPatient && <p className="patient-selected">Đang thao tác: <strong>{selectedPatient.displayName}</strong><span>Mã hồ sơ: {selectedPatient.code}</span></p>}
                </>
              )}
              <div className="patient-session">
                <span className="patient-label">Phiên đăng ký</span>
                <strong>{!session ? 'Chưa có phiên đăng ký' : session.status === 'OPEN' ? 'Đang nhận số' : 'Đã ngừng nhận số mới'}</strong>
                <p className="patient-muted">{session?.status === 'OPEN' ? 'Bạn có thể lấy số cho hồ sơ chưa có phiếu hoạt động.' : 'Hiện chưa thể lấy số mới. Phiếu đã có vẫn được hiển thị khi phiên chưa đóng.'}</p>
              </div>
            </section>

            <section className="patient-panel" aria-labelledby="patient-ticket-heading" aria-busy={ticketLoading || submitting}>
              <p className="patient-step">Bước 2</p>
              <h2 id="patient-ticket-heading">Phiếu đăng ký</h2>
              {!selectedPatient ? <p className="patient-empty">Chọn hồ sơ ở bước 1 để xem phiếu hoặc lấy số.</p>
                : ticketLoading ? <p className="patient-empty" role="status">Đang tải phiếu của {selectedPatient.code}…</p>
                  : ticketView ? <TicketCard patient={selectedPatient} ticketView={ticketView} />
                    : !ticketError && <p className="patient-empty">{session ? 'Hồ sơ này chưa có phiếu hoạt động trong phiên.' : 'Chưa có phiên đăng ký để lấy hoặc xem phiếu hoạt động.'}</p>}
              {ticketError && <p className="patient-notice patient-notice--error" role="alert">{ticketError}</p>}
              {ticketError && !pendingRequest.current && <button className="patient-button patient-button--secondary" onClick={() => setReload(reload + 1)}>Thử tải lại</button>}
              {selectedPatient && !ticketView && (
                <button className="patient-button" onClick={issueTicket} disabled={!canIssue && !(pendingRequest.current && !submitting && !ticketLoading)}>
                  {submitting ? 'Đang lấy số…' : pendingRequest.current ? 'Thử lại lấy số' : 'Lấy số đăng ký'}
                </button>
              )}
            </section>
          </div>
        )}

        <p className="patient-demo-note">Bản dựng task 1.13 dùng dữ liệu mô phỏng, chưa kết nối API và PostgreSQL. Thao tác không tạo phiếu thật.</p>
      </div>
    </main>
  );
}
