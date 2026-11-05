import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { http } from '../shared/api/http.js';
import PatientPage from '../features/patient/PatientPage.jsx';

function HomePage() {
  const [status, setStatus] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    http.get('/health', { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setStatus(data.status === 'ok' ? 'ready' : 'error'); })
      .catch(() => { if (!controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, [attempt]);
  return <main className="app-home">
    <h1>MediQueue</h1>
    <p>Ứng dụng mô phỏng đăng ký ngoại trú của nhóm 11.</p>
    <section aria-labelledby="connection-title">
      <h2 id="connection-title">Kết nối hệ thống</h2>
      <p role="status">{status === 'loading' ? 'Đang kiểm tra kết nối…'
        : status === 'ready' ? 'Hệ thống sẵn sàng. Cơ sở dữ liệu đã kết nối.'
          : 'Chưa kết nối được hệ thống. Vui lòng thử lại.'}</p>
      {status === 'error' && <button onClick={() => setAttempt((n) => n + 1)}>Thử lại</button>}
    </section>
    <p><Link to="/patient-demo">Xem thử giao diện người bệnh</Link></p>
    <p className="app-note">Bản xem thử dùng dữ liệu mô phỏng, không tạo phiếu đăng ký thật.</p>
  </main>;
}

export default function AppRoutes() {
  return <Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/patient-demo" element={<>
      <p className="app-demo-note">Bản xem thử · Dữ liệu mô phỏng, không lưu vào hệ thống.</p>
      <PatientPage />
    </>} />
    <Route path="*" element={<main className="app-home"><h1>Không tìm thấy trang</h1><Link to="/">Về trang chủ</Link></main>} />
  </Routes>;
}
