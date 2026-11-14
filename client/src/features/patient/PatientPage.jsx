import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import TicketCard from './components/TicketCard.jsx';
import { patientApi } from './patient.api.js';
import './patient.css';

export default function PatientPage({ api = patientApi, demo = false }) {
  const [patients, setPatients] = useState([]);
  const [session, setSession] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [ticketView, setTicketView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState('');
  const [accessError, setAccessError] = useState(null);
  const [ticketError, setTicketError] = useState(null);
  const [reload, setReload] = useState(0);
  const [ticketReload, setTicketReload] = useState(0);
  const pendingRequest = useRef(null);
  const submittingRef = useRef(false);
  const selectedPatient = patients.find((patient) => patient.patientId === selectedId);
  const visibleTicket = ticketView?.ticket?.patientId === selectedId
    && ticketView.ticket.sessionId === session?.sessionId ? ticketView : null;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    setPageError('');
    setAccessError(null);
    setPatients([]);
    setSession(null);
    setSelectedId('');
    setTicketView(null);
    pendingRequest.current = null;

    Promise.all([api.getPatients({ signal }), api.getCurrentSession({ signal })])
      .then(([patientResponse, sessionResponse]) => {
        if (signal.aborted) return;
        setPatients(patientResponse.data);
        setSession(sessionResponse.data);
      })
      .catch((error) => {
        if (signal.aborted) return;
        if (error.status === 401 || error.status === 403) setAccessError(error.status);
        else setPageError('Không tải được danh sách hồ sơ và phiên đăng ký. Vui lòng thử lại.');
      })
      .finally(() => { if (!signal.aborted) setLoading(false); });

    return () => controller.abort();
  }, [api, reload]);

  useEffect(() => {
    setTicketView(null);
    setTicketError(null);
    if (!selectedId || !session) {
      setTicketLoading(false);
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    setTicketLoading(true);
    api.getActiveTicket({ patientId: selectedId, sessionId: session.sessionId }, { signal })
      .then(({ data }) => { if (!signal.aborted) setTicketView(data); })
      .catch((error) => {
        if (signal.aborted) return;
        if (error.status === 401 || error.status === 403) setAccessError(error.status);
        else setTicketError({ message: 'Không tải được phiếu của hồ sơ này. Vui lòng thử lại.', retry: 'ticket' });
      })
      .finally(() => { if (!signal.aborted) setTicketLoading(false); });

    return () => controller.abort();
  }, [api, selectedId, session, ticketReload]);

  function selectPatient(event) {
    if (submittingRef.current) return;
    setSelectedId(event.target.value);
    setTicketView(null);
    setTicketError(null);
    setTicketLoading(Boolean(event.target.value && session));
    pendingRequest.current = null;
  }

  async function issueTicket() {
    if (submittingRef.current || !canIssue) return;
    submittingRef.current = true;
    setSubmitting(true);
    setTicketError(null);
    try {
      pendingRequest.current ??= {
        patientId: selectedId,
        sessionId: session.sessionId,
        requestId: crypto.randomUUID(),
      };
      let response;
      try {
        response = await api.issueTicket(pendingRequest.current);
      } catch (error) {
        if (error.code !== 'ACTIVE_TICKET_EXISTS') throw error;

        pendingRequest.current = null;
        const scope = { patientId: selectedId, sessionId: session.sessionId };
        response = error.details?.ticketId
          ? await api.getTicket(error.details.ticketId)
          : await api.getActiveTicket(scope);
        const ticket = response.data?.ticket;
        if (ticket && (ticket.patientId !== scope.patientId || ticket.sessionId !== scope.sessionId)) {
          setTicketError({ message: 'Không xác nhận được phiếu của hồ sơ này. Vui lòng tải lại phiếu.', retry: 'ticket' });
          return;
        }
      }
      setTicketView(response.data);
      pendingRequest.current = null;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        pendingRequest.current = null;
        setAccessError(error.status);
      } else if (error.code === 'INVALID_STATE' || error.status === 404) {
        pendingRequest.current = null;
        setTicketError({ message: 'Thông tin phiên hoặc phiếu đã thay đổi. Vui lòng tải lại.', retry: 'page' });
      } else if (error.status >= 400 && error.status < 500) {
        pendingRequest.current = null;
        setTicketError({ message: 'Máy chủ từ chối yêu cầu lấy số. Vui lòng tải lại phiếu.', retry: 'ticket' });
      } else if (pendingRequest.current) {
        setTicketError({ message: 'Chưa nhận được xác nhận lấy số. Vui lòng thử lại cùng thao tác.', retry: 'issue' });
      } else {
        setTicketError({ message: 'Chưa đọc được phiếu của hồ sơ này. Vui lòng tải lại phiếu.', retry: 'ticket' });
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const canIssue = selectedPatient && session?.status === 'OPEN'
    && !loading && !ticketLoading && !submitting && !visibleTicket && !pageError && !accessError
    && (!ticketError || ticketError.retry === 'issue');

  function retryTicketLoad() {
    if (ticketError.retry === 'page') setReload((value) => value + 1);
    else setTicketReload((value) => value + 1);
  }

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
                  : visibleTicket ? <TicketCard patient={selectedPatient} ticketView={visibleTicket} />
                    : !ticketError && <p className="patient-empty">{session ? 'Hồ sơ này chưa có phiếu hoạt động trong phiên.' : 'Chưa có phiên đăng ký để lấy hoặc xem phiếu hoạt động.'}</p>}
              {ticketError && <p className="patient-notice patient-notice--error" role="alert">{ticketError.message}</p>}
              {ticketError && ticketError.retry !== 'issue' && <button className="patient-button patient-button--secondary" onClick={retryTicketLoad}>Thử tải lại</button>}
              {selectedPatient && !visibleTicket && (
                <button className="patient-button" onClick={issueTicket} disabled={!canIssue}>
                  {submitting ? 'Đang lấy số…' : pendingRequest.current ? 'Thử lại lấy số' : 'Lấy số đăng ký'}
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
