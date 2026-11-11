// Logic thuần (không React) để test bằng node --test.

// Khu vực của từng vai trò sau khi đăng nhập.
export const ROLE_HOME = { REPRESENTATIVE: '/patient', STAFF: '/staff' };

export function homeFor(role) {
  return ROLE_HOME[role] ?? '/';
}

export function validateLoginForm({ username, password }) {
  if (!String(username ?? '').trim()) return 'Vui lòng nhập tên đăng nhập.';
  if (!String(password ?? '')) return 'Vui lòng nhập mật khẩu.';
  return '';
}

export function loginErrorMessage(error) {
  if (error?.status === 401) return 'Tên đăng nhập hoặc mật khẩu không đúng.';
  if (error?.status === 400) return 'Vui lòng nhập đủ tên đăng nhập và mật khẩu.';
  if (error?.status === 403) return 'Yêu cầu bị từ chối. Hãy mở ứng dụng từ địa chỉ http://localhost:5173.';
  return 'Không đăng nhập được. Vui lòng kiểm tra kết nối và thử lại.';
}

// Phiên hết hạn hoặc chưa đăng nhập: màn hình khác dùng hàm này để đưa người dùng về /login.
export function isUnauthenticated(error) {
  return error?.status === 401;
}
