import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { sessionApi } from './session.api.js';

function readError(error) {
  if (error?.status === 401) return 'Bạn cần đăng nhập bằng tài khoản nhân viên.';
  if (error?.status === 403) return 'Tài khoản này không có quyền quản lý phiên đăng ký.';
  return 'Không tải được phiên hiện tại. Vui lòng thử lại.';
}

const actionMessages = {
  open: { pending: 'Đang mở phiên…', success: 'Đã mở phiên đăng ký.' },
  stop: { pending: 'Đang ngừng cấp số…', success: 'Đã ngừng cấp số mới. Tiếp tục xử lý các phiếu còn lại.' },
  close: { pending: 'Đang đóng phiên…', success: 'Đã đóng phiên đăng ký.' },
};

const conflicts = {
  SESSION_ALREADY_ACTIVE: 'Máy chủ từ chối mở thêm vì đã có phiên chưa đóng.',
  INVALID_STATE: 'Trạng thái phiên đã thay đổi. Thao tác vừa gửi không được chấp nhận.',
  ACTIVE_TICKETS_REMAIN: 'Còn phiếu đang chờ hoặc tiếp nhận. Hãy xử lý hết trước khi đóng phiên.',
  NOT_FOUND: 'Không tìm thấy phiên vừa thao tác.',
};

export default function SessionPanel({ onSessionChange, currentSession }) {
  const headingId = useId();
  const request = useRef(null);
  const [session, setSession] = useState(undefined);
  const [pending, setPending] = useState('refresh');
  const [notice, setNotice] = useState(null);

  const load = useCallback(async (action, sessionId) => {
    if (request.current) return false;
    const controller = new AbortController();
    const { signal } = controller;
    request.current = controller;
    setPending(action);
    setNotice(null);
    let unconfirmed = false;
    try {
      if (action !== 'refresh') {
        try {
          const changed = action === 'open'
            ? await sessionApi.open({ signal })
            : await sessionApi[action](sessionId, { signal });
          if (signal.aborted) return false;
          setSession(changed.status === 'CLOSED' ? null : changed);
          setNotice({ message: actionMessages[action].success, success: true });
        } catch (error) {
          if (signal.aborted || error?.status === 401 || error?.status === 403) throw error;
          setSession(undefined);
          unconfirmed = !conflicts[error?.code];
          setNotice({ message: conflicts[error?.code]
            ?? 'Chưa nhận được xác nhận thao tác. Đang tải lại trạng thái từ máy chủ.' });
        }
      } else {
        setSession(undefined);
      }

      const current = await sessionApi.getStaffCurrent({ signal });
      if (signal.aborted) return false;
      setSession(current);
      if (unconfirmed) {
        setNotice({ message: 'Chưa nhận được xác nhận thao tác. Đã tải lại trạng thái phiên từ máy chủ.' });
      }
      return true;
    } catch (error) {
      if (!signal.aborted) {
        setSession(undefined);
        setNotice({ message: readError(error), signIn: error?.status === 401 });
      }
      return false;
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(null);
      }
    }
  }, []);

  useEffect(() => {
    const refresh = () => { void load('refresh'); };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      request.current?.abort();
      request.current = null;
    };
  }, [load]);

  // StaffPage supplies its authoritative polling snapshot, including other windows' changes.
  useEffect(() => {
    if (currentSession !== undefined && !request.current) setSession(currentSession);
  }, [currentSession]);

  async function perform(action) {
    if (await load(action, session?.sessionId)) onSessionChange?.();
  }

  return (
    <section className="staff-session" aria-labelledby={headingId} aria-busy={Boolean(pending)}>
      <h2 className="staff-label" id={headingId}>Phiên đăng ký</h2>
      {pending === 'refresh' && <p role="status">Đang tải phiên…</p>}
      {session === null && <strong>Chưa có phiên</strong>}
      {session && <strong>{session.status === 'STOPPED' ? 'Đã ngừng cấp số mới' : 'Đang nhận số'}</strong>}
      {session && <span className="staff-muted">Số đã cấp gần nhất: {session.lastIssuedNumber}</span>}
      {session?.status === 'STOPPED' && <p>Tiếp tục gọi và xử lý phiếu cũ. Đóng phiên sau khi hết phiếu hoạt động.</p>}
      {session === null && (
        <button type="button" className="staff-button staff-button--secondary" disabled={Boolean(pending)} onClick={() => perform('open')}>
          {pending === 'open' ? actionMessages.open.pending : 'Mở phiên'}
        </button>
      )}
      {session?.status === 'OPEN' && (
        <button type="button" className="staff-button staff-button--secondary" disabled={Boolean(pending)} onClick={() => perform('stop')}>
          {pending === 'stop' ? actionMessages.stop.pending : 'Ngừng cấp số'}
        </button>
      )}
      {session?.status === 'STOPPED' && (
        <button type="button" className="staff-button staff-button--secondary" disabled={Boolean(pending)} onClick={() => perform('close')}>
          {pending === 'close' ? actionMessages.close.pending : 'Đóng phiên'}
        </button>
      )}
      <button type="button" className="staff-button staff-button--secondary" disabled={Boolean(pending)} onClick={() => perform('refresh')}>
        Tải lại phiên
      </button>
      {notice && <p role={notice.success ? 'status' : 'alert'}>{notice.message}</p>}
      {notice?.signIn && <Link to="/login">Đăng nhập</Link>}
    </section>
  );
}
