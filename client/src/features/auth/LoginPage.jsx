import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from './auth.api.js';
import { homeFor, loginErrorMessage, validateLoginForm } from './auth.logic.js';
import './auth.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submittingRef.current) return;
    const problem = validateLoginForm({ username, password });
    if (problem) { setError(problem); return; }
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const { data } = await authApi.login(username.trim(), password);
      navigate(homeFor(data.user.role), { replace: true });
    } catch (err) {
      setPassword('');
      setError(loginErrorMessage(err));
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return <main className="login-page">
    <h1>Đăng nhập</h1>
    <p className="login-hint">Dùng tài khoản được cấp để xem hồ sơ và lấy số, hoặc vận hành quầy.</p>
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="login-username">Tên đăng nhập</label>
      <input id="login-username" name="username" value={username} autoComplete="username"
        onChange={(e) => setUsername(e.target.value)} disabled={submitting} autoFocus />
      <label htmlFor="login-password">Mật khẩu</label>
      <input id="login-password" name="password" type="password" value={password} autoComplete="current-password"
        onChange={(e) => setPassword(e.target.value)} disabled={submitting} />
      {error && <p className="login-error" role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>{submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
    </form>
  </main>;
}
