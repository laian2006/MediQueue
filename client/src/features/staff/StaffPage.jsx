import { useCallback, useEffect, useRef, useState } from 'react';
import CurrentTicket from './components/CurrentTicket.jsx';
import WaitingList from './components/WaitingList.jsx';
import { staffMockApi } from './mocks/staff.mock.js';
import './staff.css';

const callErrors = {
  COUNTER_BUSY: 'Máy chủ từ chối: quầy đang có lượt khác, có thể do cửa sổ khác vừa gọi. Màn hình được tải lại theo dữ liệu máy chủ.',
  QUEUE_EMPTY: 'Máy chủ từ chối: hàng chờ đã hết khi gửi yêu cầu. Màn hình được tải lại theo dữ liệu máy chủ.',
  INVALID_STATE: 'Máy chủ từ chối: trạng thái phiên hoặc phiếu đã thay đổi. Màn hình được tải lại theo dữ liệu máy chủ.',
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
export default function StaffPage({ api = staffMockApi, sessionPanel = null }) {
  const [snapshot, setSnapshot] = useState(null);
  const [refreshing, setRefreshing] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [accessError, setAccessError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const submittingRef = useRef(false);
  const loadSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++loadSeq.current;
    setRefreshing(true);
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

  return (
    <main className="staff-page">
      <header className="staff-header">
        <a className="staff-brand" href="#staff-content" aria-label="MediQueue, đến nội dung chính">MediQueue<span>Vận hành quầy đăng ký</span></a>
        <span className="staff-demo-label">Bản xem thử · Dữ liệu mô phỏng</span>
      </header>

      <div className="staff-content" id="staff-content">
        <h1>Vận hành quầy</h1>

        {!snapshot && refreshing && <p className="staff-notice" role="status">Đang tải trạng thái quầy…</p>}
        {!snapshot && !refreshing && accessError && (
          <div className="staff-notice staff-notice--error" role="alert">
            <p>{accessError} Không hiển thị dữ liệu quầy.</p>
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
            {sessionPanel ?? (
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

        <p className="staff-demo-note">Bản dựng task 1.16 dùng dữ liệu mô phỏng, chưa kết nối API và PostgreSQL. Thao tác không đổi phiếu thật.</p>
      </div>
    </main>
  );
}
