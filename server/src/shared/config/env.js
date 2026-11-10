function integer(value, fallback, name, max) {
  const text = value ?? String(fallback);
  if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > max) {
    throw new Error(`${name} must be a positive integer <= ${max}.`);
  }
  return Number(text);
}

export function loadEnv(env = process.env) {
  let databaseUrl;
  let origin;
  try {
    databaseUrl = new URL(env.DATABASE_URL);
    origin = new URL(env.CLIENT_ORIGIN ?? 'http://localhost:5173');
  } catch {
    throw new Error('DATABASE_URL and CLIENT_ORIGIN must be valid URLs.');
  }
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL.');
  }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== origin.href.replace(/\/$/, '')) {
    throw new Error('CLIENT_ORIGIN must be an HTTP(S) origin without a path.');
  }
  if (typeof env.SESSION_SECRET !== 'string' || env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET must have at least 32 characters.');
  }
  if (env.COOKIE_SECURE !== undefined && !['true', 'false'].includes(env.COOKIE_SECURE)) {
    throw new Error('COOKIE_SECURE must be true or false.');
  }
  const cookieSecure = env.COOKIE_SECURE === 'true';
  if (env.NODE_ENV === 'production' && !cookieSecure) {
    throw new Error('Production requires COOKIE_SECURE=true and HTTPS.');
  }
  return {
    port: integer(env.PORT, 3000, 'PORT', 65535),
    databaseUrl: env.DATABASE_URL,
    clientOrigin: origin.origin,
    sessionSecret: env.SESSION_SECRET,
    cookieSecure,
    noShowTimeoutSeconds: integer(env.NO_SHOW_TIMEOUT_SECONDS, 60, 'NO_SHOW_TIMEOUT_SECONDS', 86400),
  };
}
