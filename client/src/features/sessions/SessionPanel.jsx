import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { sessionApi } from './session.api.js';

function readError(error) {
  if (error?.status === 401) return 'Bạn cần đăng nhập bằng tài khoản nhân viên.';
  if (error?.status === 403) return 'Tài khoản này không có quyền quản lý phiên đăng ký.';
  return 'Không tải được phiên hiện tại. Vui lòng thử lại.';
}

export default function SessionPanel({ onSessionChange }) {
  const headingId = useId();
  const request = useRef(null);
  const [session, setSession] = useState(undefined);
  const [pending, setPending] = useState('refresh');
  const [notice, setNotice] = useState(null);

  const load = useCallback(async (action) => {
    if (request.current) return false;
    const controller = new AbortController();
    const { signal } = controller;
    request.current = controller;
    setPending(action);
    setNotice(null);
    let openProblem = '';

    try {
      if (action === 'open') {
        try {
          const opened = await sessionApi.open({ signal });
          if (signal.aborted) return false;
          setSession(opened);
          setNotice({ message: 'Đã mở phiên đăng ký.', success: true });
          return true;
        } catch (error) {
          if (signal.aborted || error?.status === 401 || error?.status === 403) throw error;
          setSession(undefined);
          openProblem = error?.code === 'SESSION_ALREADY_ACTIVE'
            ? 'Máy chủ từ chối mở thêm vì đã có phiên chưa đóng.'
            : 'Chưa nhận được xác nhận mở phiên.';
          setNotice({ message: `${openProblem} Đang tải lại trạng thái.` });
        }
      } else {
        setSession(undefined);
      }

      const current = await sessionApi.getStaffCurrent({ signal });
      if (!signal.aborted) {
        setSession(current);
        if (openProblem) {
          const result = current ? 'Đã tải phiên hiện tại từ máy chủ.' : 'Hiện chưa có phiên. Bạn có thể thử mở lại.';
          setNotice({ message: `${openProblem} ${result}` });
        }
      }
    } catch (error) {
      if (!signal.aborted) {
        setSession(undefined);
        setNotice({ message: readError(error), signIn: error?.status === 401 });
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(null);
      }
    }
    return false;
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

  async function open() {
    if (session === null && await load('open')) onSessionChange?.();
  }

  return (
    <section className="staff-session" aria-labelledby={headingId} aria-busy={Boolean(pending)}>
      <h2 className="staff-label" id={headingId}>Phiên đăng ký</h2>
      {pending === 'refresh' && <p role="status">Đang tải phiên…</p>}
      {session === null && <strong>Chưa có phiên</strong>}
      {session && <strong>{session.status === 'STOPPED' ? 'Đã ngừng cấp số mới' : 'Đang nhận số'}</strong>}
      {session && <span className="staff-muted">Số đã cấp gần nhất: {session.lastIssuedNumber}</span>}
      {session === null && (
        <button type="button" className="staff-button staff-button--secondary" disabled={Boolean(pending)} onClick={open}>
          {pending === 'open' ? 'Đang mở phiên…' : 'Mở phiên'}
        </button>
      )}
      <button type="button" className="staff-button staff-button--secondary" disabled={Boolean(pending)} onClick={() => load('refresh')}>
        Tải lại phiên
      </button>
      {notice && <p role={notice.success ? 'status' : 'alert'}>{notice.message}</p>}
      {notice?.signIn && <Link to="/login">Đăng nhập</Link>}
    </section>
  );
}
