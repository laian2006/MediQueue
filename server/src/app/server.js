import { once } from 'node:events';
import { loadEnv } from '../shared/config/env.js';
import { createPool } from '../shared/db/pool.js';
import { createApp } from './app.js';

let pool;
let app;
try {
  const config = loadEnv();
  pool = createPool(config);
  await pool.query('SELECT 1');
  app = createApp({ pool, config });
  const server = app.listen(config.port);
  await once(server, 'listening');
  console.log(`MediQueue API listening on http://localhost:${config.port}/api/v1`);
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10000).unref();
    server.close(async () => {
      await app.locals.sessionStore.close();
      await pool.end();
      clearTimeout(timeout);
    });
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch {
  console.error('API startup failed. Check .env, PostgreSQL and the configured port.');
  if (app) await app.locals.sessionStore.close();
  if (pool) await pool.end();
  process.exitCode = 1;
}
