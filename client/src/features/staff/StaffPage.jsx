import { cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from 'react';
import CurrentTicket from './components/CurrentTicket.jsx';
import WaitingList from './components/WaitingList.jsx';
import { staffApi } from './staff.api.js';
import { noShowRemainingSeconds, serverOffsetMs } from './noShowTiming.js';
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
// 2.16: lỗi của thao tác theo phiếu (gọi lại, bắt đầu, hoàn tất), hợp đồng 2.10.
const ticketErrors = {
  INVALID_STATE: 'Máy chủ từ chối: trạng thái phiếu đã thay đổi, có thể do cửa sổ khác vừa thao tác. Màn hình được tải lại theo dữ liệu máy chủ.',
  NOT_FOUND: 'Máy chủ từ chối: không tìm thấy phiếu này. Màn hình được tải lại theo dữ liệu máy chủ.',
};

// Mỗi thao tác: gọi API nào, báo gì khi máy chủ xác nhận, báo gì khi chưa có xác nhận.
const actions = {
  callNext: {
    label: 'Gọi số tiếp theo',
    busyLabel: 'Đang gọi…',
    send: (api, snapshot) => api.callNext({ sessionId: snapshot.session.sessionId }),
    success: (ticket) => `Máy chủ đã xác nhận gọi số ${ticket.number}.`,
    errors: callErrors,
    unconfirmed: 'Chưa nhận được xác nhận gọi số, số có thể đã hoặc chưa được gọi. Hãy kiểm tra lượt hiện tại trước khi thao tác tiếp.',
  },
  recall: {
    label: 'Gọi lại',
    busyLabel: 'Đang gọi lại…',
    send: (api, snapshot) => api.recall({ ticketId: snapshot.current.ticketId }),
    success: (ticket) => `Máy chủ đã xác nhận gọi lại số ${ticket.number}. Số thứ tự giữ nguyên.`,
    errors: ticketErrors,
    unconfirmed: 'Chưa nhận được xác nhận gọi lại. Hãy kiểm tra lượt hiện tại trước khi thao tác tiếp.',
  },
  start: {
    label: 'Bắt đầu tiếp nhận',
    busyLabel: 'Đang bắt đầu…',
    send: (api, snapshot) => api.start({ ticketId: snapshot.current.ticketId }),
    success: (ticket) => `Máy chủ đã xác nhận bắt đầu tiếp nhận số ${ticket.number}.`,
    errors: ticketErrors,
    unconfirmed: 'Chưa nhận được xác nhận bắt đầu tiếp nhận. Hãy kiểm tra lượt hiện tại trước khi thao tác tiếp.',
  },
  complete: {
    label: 'Hoàn tất đăng ký',
    busyLabel: 'Đang hoàn tất…',
    send: (api, snapshot) => api.complete({ ticketId: snapshot.current.ticketId }),
    success: (ticket) => `Máy chủ đã xác nhận hoàn tất đăng ký số ${ticket.number}. Quầy rảnh để gọi số tiếp theo.`,
    errors: ticketErrors,
    unconfirmed: 'Chưa nhận được xác nhận hoàn tất, lượt có thể đã hoặc chưa hoàn tất. Hãy kiểm tra lượt hiện tại trước khi thao tác tiếp.',
  },
};
// Thao tác theo phiếu được hiện theo trạng thái lượt hiện tại (CALLED → REGISTERING → COMPLETED).
// 2.17: ghi vắng theo hợp đồng 2.11; máy chủ quyết định đã đủ T hay chưa.
actions.noShow = {
  label: 'Ghi vắng',
  busyLabel: 'Đang ghi vắng…',
  send: (api, snapshot) => api.noShow({ ticketId: snapshot.current.ticketId }),
  success: (ticket) => `Máy chủ đã xác nhận ghi vắng số ${ticket.number}. Quầy rảnh để gọi số tiếp theo.`,
  errors: {
    ...ticketErrors,
    NO_SHOW_TOO_EARLY: (error) => {
      const left = Number.isFinite(error?.details?.remainingSeconds) ? ` (còn ${error.details.remainingSeconds} giây)` : '';
      return `Máy chủ từ chối ghi vắng: chưa đủ thời gian chờ kể từ lần gọi gần nhất${left}, có thể do cửa sổ khác vừa gọi lại. Màn hình được tải lại theo dữ liệu máy chủ.`;
    },
  },
  unconfirmed: 'Chưa nhận được xác nhận ghi vắng, lượt có thể đã hoặc chưa được ghi vắng. Hãy kiểm tra lượt hiện tại trước khi thao tác tiếp.',
};

const ticketActionsByStatus = {
  CALLED: ['start', 'recall', 'noShow'],
  REGISTERING: ['complete'],
};

const sessionLabels = {
  OPEN: 'Đang nhận số',
  STOPPED: 'Đã ngừng cấp số mới, vẫn xử lý các phiếu còn lại',
};

function callBlockedReason({ session, current, waiting, stale }) {
  if (stale) return 'Dữ liệu có thể đã cũ. Hãy tải lại trước khi thao tác tiếp.';
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
  // Tên thao tác đang gửi (callNext, recall, start, complete) hoặc null.
  const [submitting, setSubmitting] = useState(null);
  const [result, setResult] = useState(null);
  // 2.17: đồng hồ hiển thị đếm ngược ghi vắng, chỉ chạy khi có lượt CALLED.
  const [now, setNow] = useState(() => Date.now());
  const submittingRef = useRef(false);
  const loadSeq = useRef(0);
  const activeLoads = useRef(0);
  const loadControllers = useRef(new Set());

  // silent: lượt polling, không bật trạng thái đang tải để màn hình không nhấp nháy.
  const refresh = useCallback(async ({ silent = false } = {}) => {
    const seq = ++loadSeq.current;
    activeLoads.current += 1;
    if (!silent) setRefreshing(true);
    const controller = new AbortController();
    loadControllers.current.add(controller);
    const options = { signal: controller.signal };
    const fail = (error) => {
      if (seq !== loadSeq.current) return;
      if (accessErrors[error?.code]) {
        // 401/403: bỏ dữ liệu quầy đã có ngay, không giữ lại như dữ liệu cũ.
        setSnapshot(null);
        setResult(null);
        setAccessError(accessErrors[error.code]);
      } else {
        setLoadError('Không tải được trạng thái quầy.');
      }
    };
    try {
      const { data: session } = await api.getCurrentSession(options);
      let waiting = [];
      let current = null;
      let timing = { noShowTimeoutSeconds: null, serverOffsetMs: 0 };
      if (session) {
        const query = { sessionId: session.sessionId };
        const requests = [api.getWaitingQueue(query, options), api.getCurrentQueue(query, options)];
        try {
          const [waitingResponse, currentResponse] = await Promise.all(requests);
          waiting = waitingResponse.data.tickets;
          current = currentResponse.data.ticket;
          timing = {
            noShowTimeoutSeconds: currentResponse.data.noShowTimeoutSeconds,
            // Lệch giữa đồng hồ máy chủ và trình duyệt tại lúc nhận phản hồi.
            serverOffsetMs: serverOffsetMs(currentResponse.data.serverTime, Date.now()),
          };
        } catch (error) {
          // Một request lỗi: báo ngay, hủy request còn treo và chờ nó kết thúc
          // trước khi giảm activeLoads, để polling không gửi lượt chồng lên.
          fail(error);
          controller.abort();
          await Promise.allSettled(requests);
          return;
        }
      }
      // Phản hồi của lần đọc cũ về trễ không được ghi đè lần đọc mới.
      if (seq !== loadSeq.current) return;
      setSnapshot({ session, waiting, current, ...timing, receivedAt: new Date().toISOString() });
      setLoadError('');
      setAccessError('');
    } catch (error) {
      fail(error);
    } finally {
      loadControllers.current.delete(controller);
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
    return () => {
      loadSeq.current += 1;
      // Rời màn hình: hủy các request đọc còn treo.
      loadControllers.current.forEach((controller) => controller.abort());
    };
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

  const countingDown = snapshot?.current?.status === 'CALLED';
  useEffect(() => {
    if (!countingDown) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [countingDown, snapshot]);

  const stale = Boolean(loadError);
  const blockedReason = snapshot ? callBlockedReason({ ...snapshot, stale }) : '';
  const ready = Boolean(snapshot) && !refreshing && !submitting;
  const canCallNext = ready && !blockedReason;
  // Thao tác theo phiếu cần dữ liệu mới; dữ liệu cũ thì khóa và nhắc tải lại.
  const ticketActions = snapshot?.current ? ticketActionsByStatus[snapshot.current.status] ?? [] : [];
  const canActOnTicket = ready && !stale;
  const noShowRemaining = noShowRemainingSeconds(snapshot, now);
  const isEnabled = (name) => canActOnTicket && (name !== 'noShow' || noShowRemaining === 0);

  async function run(name) {
    const action = actions[name];
    const allowed = name === 'callNext' ? canCallNext : isEnabled(name) && ticketActions.includes(name);
    if (submittingRef.current || !allowed) return;
    submittingRef.current = true;
    setSubmitting(name);
    setResult(null);
    try {
      const { data: ticket } = await action.send(api, snapshot);
      setResult({ type: 'success', text: action.success(ticket) });
    } catch (error) {
      if (accessErrors[error?.code]) {
        // Máy chủ đã từ chối dứt khoát, không báo "chưa có xác nhận".
        setSnapshot(null);
        setAccessError(accessErrors[error.code]);
      } else if (action.errors[error?.code]) {
        const message = action.errors[error.code];
        setResult({ type: 'error', text: typeof message === 'function' ? message(error) : message });
      } else if (error?.status >= 400 && error.status < 500) {
        // Máy chủ đã trả lời từ chối với mã chưa có thông báo riêng: không đổi gì, không phải "chưa xác nhận".
        setResult({ type: 'error', text: `Máy chủ từ chối thao tác (${error.code}). Màn hình được tải lại theo dữ liệu máy chủ.` });
      } else {
        setResult({ type: 'error', text: action.unconfirmed });
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(null);
      // Thành công hay bị từ chối đều đọc lại, UI không tự đổi trạng thái lượt.
      refresh();
    }
  }

  function reload() {
    setResult(null);
    refresh();
  }

  // Chốt thiết kế, mục 2: SessionPanel gọi onSessionChange sau khi API xác nhận đổi phiên.
  const panel = isValidElement(sessionPanel)
    ? cloneElement(sessionPanel, { onSessionChange: reload, currentSession: snapshot?.session })
    : sessionPanel;

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
              <section className="staff-panel staff-panel--current" aria-labelledby="staff-current-heading" aria-busy={refreshing || Boolean(submitting)}>
                <div className="staff-panel-heading">
                  <h2 id="staff-current-heading">Lượt hiện tại</h2>
                  <span className={`staff-counter staff-counter--${snapshot.current ? 'busy' : 'free'}`}>{snapshot.current ? 'Quầy bận' : 'Quầy rảnh'}</span>
                </div>
                <CurrentTicket ticket={snapshot.current} noShowRemaining={noShowRemaining} noShowTimeoutSeconds={snapshot.noShowTimeoutSeconds} />
                {ticketActions.length > 0 && (
                  <div className="staff-actions" role="group" aria-label={`Thao tác với số ${snapshot.current.number}`}>
                    {ticketActions.map((name, index) => (
                      <button
                        key={name}
                        className={`staff-button${index > 0 ? ' staff-button--secondary' : ''}`}
                        onClick={() => run(name)}
                        disabled={!isEnabled(name)}
                      >
                        {submitting === name ? actions[name].busyLabel : actions[name].label}
                      </button>
                    ))}
                  </div>
                )}
                <button className={`staff-button${ticketActions.length > 0 ? ' staff-button--secondary staff-button--block' : ''}`} onClick={() => run('callNext')} disabled={!canCallNext}>
                  {submitting === 'callNext' ? actions.callNext.busyLabel : actions.callNext.label}
                </button>
                {blockedReason && <p className="staff-hint">{blockedReason}</p>}
              </section>

              <section className="staff-panel" aria-labelledby="staff-waiting-heading" aria-busy={refreshing || Boolean(submitting)}>
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
