import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '../config/session.config.js';

/**
 * express-session + connect-pg-simple (store PostgreSQL, bảng auth_sessions).
 * `pool` là pool pg dùng chung do Trực cung cấp. Cần dependency: express-session, connect-pg-simple.
 * Đăng ký TRƯỚC các router: app.use(createSessionMiddleware({ pool, secret, secure })).
 */
export function createSessionMiddleware({ pool, secret, secure = false, schemaName }) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('SESSION_SECRET phải có ít nhất 32 ký tự.');
  }
  const PgStore = connectPgSimple(session);
  const store = new PgStore({
    pool, schemaName, tableName: 'auth_sessions', createTableIfMissing: true,
    disableTouch: true,
    errorLog: () => console.error('Session store operation failed.'),
  });
  const middleware = session({
    name: SESSION_COOKIE_NAME,
    secret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    cookie: sessionCookieOptions({ secure }),
  });
  // App lifecycle owns cleanup; tests can isolate the technical table in a test schema.
  middleware.store = store;
  return middleware;
}
