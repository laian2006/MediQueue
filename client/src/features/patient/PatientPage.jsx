import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import TicketCard from './components/TicketCard.jsx';
import { patientApi } from './patient.api.js';
import { isTicketInScope, usePatientTicket } from './usePatientTicket.js';
import './patient.css';

const activeStatuses = ['WAITING', 'CALLED', 'REGISTERING'];

export default function PatientPage({ api = patientApi, demo = false }) {
  const [patients, setPatients] = useState([]);
  const [initialSession, setInitialSession] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState(null);
  const [pageError, setPageError] = useState('');
  const [accessError, setAccessError] = useState(null);
  const [ticketError, setTicketError] = useState(null);
  const [reload, setReload] = useState(0);
  const pendingRequest = useRef(null);
  const submittingRef = useRef(false);
  const selectedPatient = patients.find((patient) => patient.patientId === selectedId);
  const tracker = usePatientTicket({
    api, patientId: selectedId, initialSession, demo, busy: submittingRef,
    paused: Boolean(action || accessError), onAccessError: setAccessError,
  });
  const { session, view: visibleTicket, loading: ticketLoading, stale, checking, syncedAt } = tracker;
  const ticket = visibleTicket?.ticket;
  const hasActiveTicket = activeStatuses.includes(ticket?.status);
  const canAct = selectedPatient && !loading && !ticketLoading && !action && !stale && !checking && !pageError && !accessError;
  const canIssue = canAct && session?.status === 'OPEN' && !hasActiveTicket;
  const showCancel = !demo && ticket?.status === 'WAITING' && ['OPEN', 'STOPPED'].includes(session?.status);
  const canCancel = canAct && showCancel;
  const retryingIssue = pendingRequest.current?.patientId === selectedId
    && pendingRequest.current?.sessionId === session?.sessionId;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    setPageError('');
    setAccessError(null);
    setPatients([]);
    setInitialSession(null);
    setSelectedId('');
    setTicketError(null);
    pendingRequest.current = null;

    Promise.all([api.getPatients({ signal }), api.getCurrentSession({ signal })])
      .then(([patientResponse, sessionResponse]) => {
        if (signal.aborted) return;
        setPatients(patientResponse.data);
        setInitialSession(sessionResponse.data);
      })
      .catch((error) => {
        if (signal.aborted) return;
        if (error.status === 401 || error.status === 403) setAccessError(error.status);
        else setPageError('Không tải được danh sách hồ sơ và phiên đăng ký. Vui lòng thử lại.');
      })
      .finally(() => { if (!signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [api, reload]);

  function selectPatient(event) {
    if (submittingRef.current) return;
    if (selectedId === event.target.value) return;
    tracker.clear();
    setSelectedId(event.target.value);
    setTicketError(null);
    pendingRequest.current = null;
  }

  async function issueTicket() {
    if (submittingRef.current || !canIssue) return;
    submittingRef.current = true;
    setAction('issue');
    setTicketError(null);
    const signal = AbortSignal.timeout(10000);
    try {
      if (!retryingIssue) {
        pendingRequest.current = { patientId: selectedId, sessionId: session.sessionId, requestId: crypto.randomUUID() };
      }
      const scope = pendingRequest.current;
      let response;
      try {
        response = await api.issueTicket(scope, { signal });
      } catch (error) {
        if (error.code !== 'ACTIVE_TICKET_EXISTS' && !(retryingIssue && error.code === 'IDEMPOTENCY_CONFLICT')) throw error;
        response = await api.getActiveTicket(scope, { signal });
        if (!response.data) throw error;
      }
      if (!isTicketInScope(response.data, selectedId, session.sessionId)) {
        throw new Error('Ticket does not match the selected profile and session');
      }
      tracker.accept(session, response.data);
      pendingRequest.current = null;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        pendingRequest.current = null;
        setAccessError(error.status);
      } else if (error.code === 'INVALID_STATE' || error.status === 404) {
        pendingRequest.current = null;
        tracker.invalidate();
        setTicketError({ message: 'Phiên đăng ký đã thay đổi. Vui lòng kiểm tra trạng thái phiên trước khi lấy số.', action: 'issue' });
      } else if (error.status >= 400 && error.status < 500) {
        pendingRequest.current = null;
        setTicketError({ message: 'Máy chủ từ chối yêu cầu lấy số. Vui lòng kiểm tra phiếu trước khi thử lại.', action: 'issue' });
      } else if (pendingRequest.current) {
        setTicketError({ message: 'Chưa nhận được xác nhận lấy số. Vui lòng thử lại cùng thao tác.', action: 'issue' });
      } else {
        setTicketError({ message: 'Chưa đọc được phiếu của hồ sơ này. Vui lòng thử tải lại.', action: 'issue' });
      }
    } finally {
      submittingRef.current = false;
      setAction(null);
    }
  }

  async function cancelTicket() {
    if (submittingRef.current || !canCancel) return;
    submittingRef.current = true;
    setAction('cancel');
    setTicketError(null);
    try {
      const { data } = await api.cancelTicket(ticket.ticketId, { signal: AbortSignal.timeout(10000) });
      if (!isTicketInScope(data, selectedId, session.sessionId)
        || data.ticket.ticketId !== ticket.ticketId || data.ticket.status !== 'CANCELLED') {
        throw new Error('Cancellation response does not match the selected ticket');
      }
      tracker.accept(session, data);
      pendingRequest.current = null;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        tracker.clear();
        setAccessError(error.status);
      } else {
        // Pause writes until the read triggered on resume confirms the current state.
        tracker.invalidate();
        setTicketError({
          message: error.status === 409
            ? 'Trạng thái phiếu đã thay đổi. Vui lòng kiểm tra trạng thái mới.'
            : 'Chưa xác nhận được yêu cầu hủy. Vui lòng kiểm tra trạng thái phiếu trước khi thử lại.',
          action: 'cancel',
        });
      }
    } finally {
      submittingRef.current = false;
      setAction(null);
    }
  }

  const visibleError = ticketError && !(ticketError.action === 'issue' && hasActiveTicket)
    && !(ticketError.action === 'cancel' && ticket?.status === 'CANCELLED');

  return (
    <main className="patient-page">
      <header className="patient-header">
        <a className="patient-brand" href="#patient-content" aria-label="MediQueue, đến nội dung chính">MediQueue<span>Đăng ký ngoại trú</span></a>
        {demo && <span className="patient-demo-label">Bản xem thử · Dữ liệu mô phỏng</span>}
      </header>

      <div className="patient-content" id="patient-content">
        <div className="patient-intro">
          <p className="patient-kicker">Dành cho người bệnh và người đại diện</p>
          <h1>Lấy số và theo dõi lượt đăng ký</h1>
          <p>Chọn đúng hồ sơ để xem số thứ tự và trạng thái tại quầy.</p>
        </div>

        {loading ? <p className="patient-notice" role="status">Đang tải hồ sơ và phiên đăng ký…</p> : accessError ? (
          <div className="patient-notice patient-notice--error" role="alert">
            <p>{accessError === 401 ? 'Bạn cần đăng nhập để xem hồ sơ và phiếu đăng ký.' : 'Tài khoản không có quyền truy cập hồ sơ hoặc phiếu này.'}</p>
            {accessError === 401 ? <Link to="/login">Đăng nhập</Link>
              : <button className="patient-button patient-button--secondary" onClick={() => setReload((value) => value + 1)}>Tải lại hồ sơ</button>}
          </div>
        ) : pageError ? (
          <div className="patient-notice patient-notice--error" role="alert">
            <p>{pageError}</p>
            <button className="patient-button patient-button--secondary" onClick={() => setReload((value) => value + 1)}>Thử tải lại</button>
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
                  <select id="patient-profile" value={selectedId} onChange={selectPatient} disabled={Boolean(action)}>
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

            <section className="patient-panel" aria-labelledby="patient-ticket-heading" aria-busy={ticketLoading || checking || Boolean(action)}>
              <p className="patient-step">Bước 2</p>
              <h2 id="patient-ticket-heading">Phiếu đăng ký</h2>
              {!selectedPatient ? <p className="patient-empty">Chọn hồ sơ ở bước 1 để xem phiếu hoặc lấy số.</p>
                : ticketLoading ? <p className="patient-empty" role="status">Đang tải phiếu của {selectedPatient.code}…</p>
                  : visibleTicket ? <TicketCard patient={selectedPatient} ticketView={visibleTicket} />
                    : !stale && !visibleError && <p className="patient-empty">{session ? 'Hồ sơ này chưa có phiếu hoạt động trong phiên.' : 'Chưa có phiên đăng ký để lấy hoặc xem phiếu hoạt động.'}</p>}
              {checking && <p className="patient-notice" role="status">Đang kiểm tra trạng thái phiếu…</p>}
              {stale && (
                <div className="patient-notice patient-notice--error" role="status">
                  <p>{syncedAt ? `Chưa kết nối được để cập nhật. Dữ liệu từ ${new Date(syncedAt).toLocaleTimeString('vi-VN')}.`
                    : 'Chưa tải được thông tin phiếu. Vui lòng kiểm tra kết nối.'}</p>
                  <button className="patient-button patient-button--secondary" onClick={tracker.refresh}>Thử tải lại</button>
                </div>
              )}
              {visibleError && <p className="patient-notice patient-notice--error" role="alert">{ticketError.message}</p>}
              {showCancel && <button className="patient-button patient-button--secondary" onClick={cancelTicket} disabled={!canCancel}>
                {action === 'cancel' ? 'Đang hủy phiếu…' : 'Hủy phiếu'}
              </button>}
              {selectedPatient && !hasActiveTicket && (
                <button className="patient-button" onClick={issueTicket} disabled={!canIssue}>
                  {action === 'issue' ? 'Đang lấy số…' : retryingIssue ? 'Thử lại lấy số' : 'Lấy số đăng ký'}
                </button>
              )}
            </section>
          </div>
        )}

        {demo && <p className="patient-demo-note">Dữ liệu xem thử không được lưu vào hệ thống.</p>}
      </div>
    </main>
  );
}
