import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { type MigrationResult, runMigrations } from './migrations.js';

export type DbHandle = {
  db: Database.Database;
  path: string;
  migration: MigrationResult;
};

/**
 * Abre (o crea) la base SQLite, activa WAL y aplica las migraciones.
 * `timeout` alto: el escaneo escribe mientras las peticiones leen.
 */
export function openDatabase(dbPath: string): DbHandle {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('temp_store = MEMORY');
  const migration = runMigrations(db, dbPath);
  return { db, path: dbPath, migration };
}

export function closeDatabase(db: Database.Database): void {
  if (!db.open) return;
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // Un checkpoint fallido no debe impedir el cierre limpio.
  }
  db.close();
}

export type { MigrationResult };
