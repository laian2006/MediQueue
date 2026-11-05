import pg from 'pg';

export function createPool({ databaseUrl }) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  // Pool background errors otherwise become uncaught process errors. Never log credentials/SQL.
  pool.on('error', () => console.error('PostgreSQL background connection failed.'));
  return pool;
}
