// Cấu hình phiên đăng nhập dùng chung (WBS 1.4, Hưng). Chỉ chứa hằng số, không import thư viện
// để unit test chạy được mà không cần Express.
export const SESSION_COOKIE_NAME = 'mediqueue.sid';

// Hết hạn tuyệt đối 8 giờ kể từ lúc đăng nhập, không tự gia hạn theo hoạt động.
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export function sessionCookieOptions({ secure = false } = {}) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure, // true khi chạy HTTPS
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}
