import { SESSION_TTL_MS } from '../../shared/config/session.config.js';
import { toUserDto } from './auth.dto.js';
import { AuthError } from './auth.errors.js';
import { hashPassword, verifyPassword } from './password.js';

const MAX_USERNAME = 100;
const MAX_PASSWORD = 200;

function invalidInput(message) {
  return new AuthError(400, 'VALIDATION_ERROR', message);
}

function parseLoginInput(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw invalidInput('Dữ liệu đăng nhập phải là JSON gồm username và password.');
  }
  const extra = Object.keys(input).filter((key) => key !== 'username' && key !== 'password');
  if (extra.length > 0) throw invalidInput('Chỉ nhận username và password.');

  const { username, password } = input;
  if (typeof username !== 'string' || username.trim() === '' || username.length > MAX_USERNAME) {
    throw invalidInput('Tên đăng nhập không hợp lệ.');
  }
  if (typeof password !== 'string' || password === '' || password.length > MAX_PASSWORD) {
    throw invalidInput('Mật khẩu không hợp lệ.');
  }
  return { username: username.trim(), password };
}

export function createAuthService({ repository, now = () => new Date(), sessionTtlMs = SESSION_TTL_MS }) {
  // Dùng khi không có user để thời gian xử lý không lộ username nào tồn tại.
  let dummyHash;
  const getDummyHash = () => (dummyHash ??= hashPassword('khong-co-nguoi-dung-nay'));

  return {
    /** Trả { user, expiresAt: Date }. Sai thông tin: 401 INVALID_CREDENTIALS (cùng thông báo cho cả hai trường hợp). */
    async login(input) {
      const { username, password } = parseLoginInput(input);
      const row = await repository.findByUsername(username);
      const stored = row ? row.password_hash : await getDummyHash();
      const passwordOk = await verifyPassword(password, stored);

      if (!row || !passwordOk) {
        throw new AuthError(401, 'INVALID_CREDENTIALS', 'Tên đăng nhập hoặc mật khẩu không đúng.');
      }
      return { user: toUserDto(row), expiresAt: new Date(now().getTime() + sessionTtlMs) };
    },
  };
}
