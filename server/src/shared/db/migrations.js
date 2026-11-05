import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withTransaction } from './transaction.js';

const LOCK = 119004;

async function sqlFiles(directory) {
  const names = (await readdir(directory)).filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (new Set(names.map((name) => name.slice(0, 3))).size !== names.length) {
    throw new Error('Duplicate migration/seed numbers.');
  }
  return Promise.all(names.map(async (name) => {
    const sql = await readFile(join(directory, name), 'utf8');
    return { name, sql, checksum: createHash('sha256').update(sql.replaceAll('\r\n', '\n')).digest('hex') };
  }));
}

export async function migrate(pool, directory) {
  const files = await sqlFiles(directory);
  return withTransaction(pool, async (transaction) => {
    await transaction.query('SELECT pg_advisory_xact_lock($1)', [LOCK]);
    await transaction.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const applied = new Map((await transaction.query('SELECT name, checksum FROM schema_migrations')).rows
      .map((row) => [row.name, row.checksum]));
    for (const [name, checksum] of applied) {
      if (!files.some((file) => file.name === name && file.checksum === checksum)) {
        throw new Error(`Applied migration missing or changed: ${name}`);
      }
    }
    const added = [];
    for (const file of files) {
      if (applied.has(file.name)) continue;
      if ([...applied.keys()].some((name) => name > file.name)) {
        throw new Error(`Cannot insert an older migration: ${file.name}`);
      }
      await transaction.query(file.sql);
      await transaction.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file.name, file.checksum]);
      added.push(file.name);
    }
    return added;
  });
}

export async function seed(pool, directory) {
  const files = await sqlFiles(directory);
  return withTransaction(pool, async (transaction) => {
    await transaction.query('SELECT pg_advisory_xact_lock($1)', [LOCK]);
    for (const file of files) await transaction.query(file.sql);
    return files.map((file) => file.name);
  });
}
