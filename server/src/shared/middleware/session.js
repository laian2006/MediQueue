import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '../config/session.config.js';

/**
 * express-session + connect-pg-simple (store PostgreSQL, bảng auth_sessions).
 * `pool` là pool pg dùng chung do Trực cung cấp. Cần dependency: express-session, connect-pg-simple.
 * Đăng ký TRƯỚC các router: app.use(createSessionMiddleware({ pool, secret, secure })).
 */
export function createSessionMiddleware({ pool, secret, secure = false }) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('SESSION_SECRET phải có ít nhất 32 ký tự.');
  }
  const PgStore = connectPgSimple(session);
  return session({
    name: SESSION_COOKIE_NAME,
    secret,
    store: new PgStore({ pool, tableName: 'auth_sessions', createTableIfMissing: true }),
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: sessionCookieOptions({ secure }),
  });
}
