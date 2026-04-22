/**
 * Thin wrapper around expo-sqlite (Expo SDK 50 async API).
 * Exposes an `execAsync` + `getAllAsync` + `runAsync` surface so the
 * repositories can stay framework-agnostic and be unit-tested against
 * an in-memory shim.
 */
import { ALL_STATEMENTS, SCHEMA_VERSION } from './schema';

export interface SqlRow {
  [key: string]: unknown;
}

export interface SqlDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  getAllAsync<T = SqlRow>(sql: string, params?: unknown[]): Promise<T[]>;
  getFirstAsync<T = SqlRow>(
    sql: string,
    params?: unknown[],
  ): Promise<T | null>;
}

let _db: SqlDb | null = null;

export function setDb(db: SqlDb): void {
  _db = db;
}

export function getDb(): SqlDb {
  if (!_db) throw new Error('DB not initialised. Call initDb() first.');
  return _db;
}

export async function initDb(): Promise<SqlDb> {
  if (_db) return _db;
  // Dynamic import so ts-jest / Node tests don't try to load the native module.
  const mod = await import('expo-sqlite');
  const openDatabaseAsync = (mod as unknown as {
    openDatabaseAsync: (name: string) => Promise<SqlDb>;
  }).openDatabaseAsync;
  if (!openDatabaseAsync) {
    throw new Error('expo-sqlite openDatabaseAsync is unavailable.');
  }
  const db = await openDatabaseAsync('mobile-wiki.db');
  for (const stmt of ALL_STATEMENTS) {
    await db.execAsync(stmt);
  }
  // Record the schema version so future migrations know where to start.
  // Using INSERT OR IGNORE keeps the very first writer wins and avoids
  // clobbering a higher version that a later build might have written.
  await db.runAsync(
    `INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?);`,
    ['schema_version', String(SCHEMA_VERSION)],
  );
  _db = db;
  return db;
}

export async function getSchemaVersion(db: SqlDb): Promise<number> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM meta WHERE key = ?;`,
    ['schema_version'],
  );
  return row ? Number(row.value) : 0;
}

export function resetDbForTests(): void {
  _db = null;
}
