import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEnv } from '../env.js';

const valid = { DATABASE_URL: 'postgresql://localhost/mediqueue_test', SESSION_SECRET: 'x'.repeat(32) };
test('environment defaults match architecture and reject invalid configuration', () => {
  const config = loadEnv(valid);
  assert.equal(config.port, 3000);
  assert.equal(config.noShowTimeoutSeconds, 60);
  assert.equal(config.clientOrigin, 'http://localhost:5173');
  for (const override of [{ DATABASE_URL: '' }, { DATABASE_URL: 'https://example.com' }, { SESSION_SECRET: '' },
    { PORT: 'abc' }, { PORT: '65536' }, { NO_SHOW_TIMEOUT_SECONDS: '0' },
    { CLIENT_ORIGIN: 'http://localhost:5173/path' }, { CLIENT_ORIGIN: 'null' },
    { COOKIE_SECURE: 'yes' }, { NODE_ENV: 'production', COOKIE_SECURE: 'false' }]) {
    assert.throws(() => loadEnv({ ...valid, ...override }));
  }
});
