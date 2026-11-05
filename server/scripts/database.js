import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/shared/config/env.js';
import { createPool } from '../src/shared/db/pool.js';
import { migrate, seed } from '../src/shared/db/migrations.js';

const command = process.argv[2];
let pool;
try {
  if (!['migrate', 'seed'].includes(command)) throw new Error('Use migrate or seed.');
  pool = createPool(loadEnv());
  const directory = fileURLToPath(new URL(`../../database/${command === 'migrate' ? 'migrations' : 'seeds'}/`, import.meta.url));
  const names = await (command === 'migrate' ? migrate : seed)(pool, directory);
  console.log(names.length ? `${command}: ${names.join(', ')}` : 'Database is up to date.');
} catch {
  console.error('Database command failed. Check configuration, database access and migration history. No reset was performed.');
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}
