import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// Băm mật khẩu bằng scrypt có sẵn trong Node, không cần thêm thư viện.
// Định dạng lưu: scrypt$N$r$p$salt(base64)$hash(base64)
const scrypt = promisify(scryptCallback);
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('Mật khẩu phải là chuỗi không rỗng.');
  }
  const salt = randomBytes(SALT_LENGTH);
  const key = await scrypt(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: 256 * PARAMS.N * PARAMS.r });
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [N, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  const validParams = Number.isInteger(N) && N >= 2 && N <= 2 ** 16 && (N & (N - 1)) === 0
    && Number.isInteger(r) && r >= 1 && r <= 16 && Number.isInteger(p) && p >= 1 && p <= 4;
  if (!validParams || salt.length === 0 || expected.length === 0) return false;

  let actual;
  try {
    actual = await scrypt(password, salt, expected.length, { N, r, p, maxmem: 256 * N * r });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
