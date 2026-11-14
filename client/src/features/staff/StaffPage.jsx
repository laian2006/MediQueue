import { cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from 'react';
import CurrentTicket from './components/CurrentTicket.jsx';
import WaitingList from './components/WaitingList.jsx';
import { staffApi } from './staff.api.js';
import './staff.css';

// Chốt thiết kế màn hình quầy, mục 3: đọc lại mỗi 3 giây khi đang mở.
const POLL_INTERVAL_MS = 3000;

const callErrors = {
  COUNTER_BUSY: 'Máy chủ từ chối: quầy đang có lượt khác, có thể do cửa sổ khác vừa gọi. Màn hình được tải lại theo dữ liệu máy chủ.',
  QUEUE_EMPTY: 'Máy chủ từ chối: hàng chờ đã hết khi gửi yêu cầu. Màn hình được tải lại theo dữ liệu máy chủ.',
  INVALID_STATE: 'Máy chủ từ chối: trạng thái phiên hoặc phiếu đã thay đổi. Màn hình được tải lại theo dữ liệu máy chủ.',
  NOT_FOUND: 'Máy chủ từ chối: phiên đăng ký không còn tồn tại. Màn hình được tải lại theo dữ liệu máy chủ.',
};
// Mã lỗi theo hợp đồng 1.4 (authenticate, requireStaff); không hiện dữ liệu quầy khi gặp hai mã này.
const accessErrors = {
  UNAUTHENTICATED: 'Bạn cần đăng nhập bằng tài khoản nhân viên để vận hành quầy.',
  FORBIDDEN: 'Tài khoản này không có quyền vận hành quầy. Chỉ nhân viên được dùng màn hình này.',
};
const unconfirmedCall ='Chưa nhận được xác nhận gọi số, số có thể đã hoặc chưa được gọi. Hãy kiểm tra lượt hiện tại trước khi thao tác tiếp.';

const sessionLabels = {
  OPEN: 'Đang nhận số',
  STOPPED: 'Đã ngừng cấp số mới, vẫn xử lý các phiếu còn lại',
};

function callBlockedReason({ session, current, waiting, stale }) {
  if (stale) return 'Dữ liệu có thể đã cũ. Hãy tải lại trước khi gọi tiếp.';
  if (!session) return 'Chưa có phiên. Cần mở phiên trước khi gọi.';
  if (current) return 'Quầy đang bận. Cần xử lý xong lượt hiện tại trước khi gọi tiếp.';
  if (waiting.length === 0) return 'Hàng chờ đang trống, chưa có số để gọi.';
  return '';
}

// sessionPanel là chỗ ghép SessionPanel của An (1.2); phần phiên không viết lại tại đây.
// demo: chỉ dùng khi truyền mock vào api, để ghi rõ dữ liệu mô phỏng trên màn hình.
export default function StaffPage({ api = staffApi, sessionPanel = null, demo = false }) {
  const [snapshot, setSnapshot] = useState(null);
  const [refreshing, setRefreshing] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [accessError, setAccessError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const submittingRef = useRef(false);
  const loadSeq = useRef(0);
  const activeLoads = useRef(0);

  // silent: lượt polling, không bật trạng thái đang tải để màn hình không nhấp nháy.
  const refresh = useCallback(async ({ silent = false } = {}) => {
    const seq = ++loadSeq.current;
    activeLoads.current += 1;
    if (!silent) setRefreshing(true);
    try {
      const { data: session } = await api.getCurrentSession();
      let waiting = [];
      let current = null;
      if (session) {
        const query = { sessionId: session.sessionId };
        const [waitingResponse, currentResponse] = await Promise.all([
          api.getWaitingQueue(query),
          api.getCurrentQueue(query),
        ]);
        waiting = waitingResponse.data.tickets;
        current = currentResponse.data.ticket;
      }
      // Phản hồi của lần đọc cũ về trễ không được ghi đè lần đọc mới.
      if (seq !== loadSeq.current) return;
      setSnapshot({ session, waiting, current, receivedAt: new Date().toISOString() });
      setLoadError('');
      setAccessError('');
    } catch (error) {
      if (seq !== loadSeq.current) return;
      if (accessErrors[error?.code]) {
        // 401/403: bỏ dữ liệu quầy đã có, không giữ lại như dữ liệu cũ.
        setSnapshot(null);
        setResult(null);
        setAccessError(accessErrors[error.code]);
      } else {
        setLoadError('Không tải được trạng thái quầy.');
      }
    } finally {
      activeLoads.current -= 1;
      if (seq === loadSeq.current) setRefreshing(false);
    }
  }, [api]);

  useEffect(() => {
    setSnapshot(null);
    setResult(null);
    setLoadError('');
    setAccessError('');
    refresh();
    return () => { loadSeq.current += 1; };
  }, [refresh]);

  // Polling chỉ khi đã có dữ liệu; bỏ lượt nếu lần đọc trước hoặc thao tác gọi chưa xong; dừng khi rời màn hình.
  const polling = Boolean(snapshot) && !accessError;
  useEffect(() => {
    if (!polling) return undefined;
    const timer = setInterval(() => {
      if (activeLoads.current === 0 && !submittingRef.current) refresh({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [polling, refresh]);

  const stale = Boolean(loadError);
  const blockedReason = snapshot ? callBlockedReason({ ...snapshot, stale }) : '';
  const canCallNext = snapshot && !blockedReason && !refreshing && !submitting;

  async function callNext() {
    if (submittingRef.current || !canCallNext) return;
    submittingRef.current = true;
    setSubmitting(true);
    setResult(null);
    try {
      const { data: ticket } = await api.callNext({ sessionId: snapshot.session.sessionId });
      setResult({ type: 'success', text: `Máy chủ đã xác nhận gọi số ${ticket.number}.` });
    } catch (error) {
      if (accessErrors[error.code]) {
        // Máy chủ đã từ chối dứt khoát, không báo "chưa có xác nhận".
        setSnapshot(null);
        setAccessError(accessErrors[error.code]);
      } else {
        setResult({ type: 'error', text: callErrors[error.code] ?? unconfirmedCall });
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      // Thành công hay bị từ chối đều đọc lại, UI không tự đổi trạng thái lượt.
      refresh();
    }
  }

  function reload() {
    setResult(null);
    refresh();
  }

  // Chốt thiết kế, mục 2: SessionPanel gọi onSessionChange sau khi API xác nhận đổi phiên.
  const panel = isValidElement(sessionPanel) ? cloneElement(sessionPanel, { onSessionChange: reload }) : sessionPanel;

  return (
    <main className="staff-page">
      <header className="staff-header">
        <a className="staff-brand" href="#staff-content" aria-label="MediQueue, đến nội dung chính">MediQueue<span>Vận hành quầy đăng ký</span></a>
        {demo && <span className="staff-demo-label">Bản xem thử · Dữ liệu mô phỏng</span>}
      </header>

      <div className="staff-content" id="staff-content">
        <h1>Vận hành quầy</h1>

        {!snapshot && refreshing && <p className="staff-notice" role="status">Đang tải trạng thái quầy…</p>}
        {!snapshot && !refreshing && accessError && (
          <div className="staff-notice staff-notice--error" role="alert">
            <p>{accessError} Không hiển thị dữ liệu quầy.</p>
            <a className="staff-link" href="/login">Đăng nhập</a>
            <button className="staff-button staff-button--secondary" onClick={reload}>Thử tải lại</button>
          </div>
        )}
        {!snapshot && !refreshing && !accessError && (
          <div className="staff-notice staff-notice--error" role="alert">
            <p>{loadError} Chưa có dữ liệu để hiển thị.</p>
            <button className="staff-button staff-button--secondary" onClick={reload}>Thử tải lại</button>
          </div>
        )}

        {snapshot && (
          <>
            {panel ?? (
              <section className="staff-session" aria-label="Phiên đăng ký">
                <span className="staff-label">Phiên đăng ký</span>
                <strong>{snapshot.session ? sessionLabels[snapshot.session.status] : 'Chưa có phiên'}</strong>
                <span className="staff-muted">Chỉ đọc. Mở, ngừng và đóng phiên sẽ dùng SessionPanel của task 1.2.</span>
              </section>
            )}

            {stale && (
              <div className="staff-notice staff-notice--warning" role="alert">
                <p>{loadError} Dữ liệu bên dưới có thể đã cũ, cập nhật lần cuối lúc {new Date(snapshot.receivedAt).toLocaleTimeString('vi-VN')}.</p>
                <button className="staff-button staff-button--secondary" onClick={reload} disabled={refreshing}>{refreshing ? 'Đang tải lại…' : 'Thử tải lại'}</button>
              </div>
            )}
            {result && (
              <p className={`staff-notice staff-notice--${result.type}`} role={result.type === 'error' ? 'alert' : 'status'}>{result.text}</p>
            )}

            <div className="staff-layout">
              <section className="staff-panel staff-panel--current" aria-labelledby="staff-current-heading" aria-busy={refreshing || submitting}>
                <div className="staff-panel-heading">
                  <h2 id="staff-current-heading">Lượt hiện tại</h2>
                  <span className={`staff-counter staff-counter--${snapshot.current ? 'busy' : 'free'}`}>{snapshot.current ? 'Quầy bận' : 'Quầy rảnh'}</span>
                </div>
                <CurrentTicket ticket={snapshot.current} />
                <button className="staff-button" onClick={callNext} disabled={!canCallNext}>
                  {submitting ? 'Đang gọi…' : 'Gọi số tiếp theo'}
                </button>
                {blockedReason && <p className="staff-hint">{blockedReason}</p>}
              </section>

              <section className="staff-panel" aria-labelledby="staff-waiting-heading" aria-busy={refreshing || submitting}>
                <div className="staff-panel-heading">
                  <h2 id="staff-waiting-heading">Hàng chờ</h2>
                  <span className="staff-count">{snapshot.waiting.length} số đang chờ</span>
                </div>
                {snapshot.session
                  ? <WaitingList tickets={snapshot.waiting} />
                  : <p className="staff-empty">Chưa có phiên nên chưa có hàng chờ.</p>}
              </section>
            </div>

            {!stale && (
              <div className="staff-sync">
                <span>{refreshing ? 'Đang đọc lại từ máy chủ…' : `Cập nhật lần cuối lúc ${new Date(snapshot.receivedAt).toLocaleTimeString('vi-VN')}`}</span>
                <button className="staff-button staff-button--secondary" onClick={reload} disabled={refreshing || submitting}>Tải lại</button>
              </div>
            )}
          </>
        )}

        {demo && <p className="staff-demo-note">Bản xem thử dùng dữ liệu mô phỏng, không kết nối API và PostgreSQL. Thao tác không đổi phiếu thật.</p>}
      </div>
    </main>
  );
}
