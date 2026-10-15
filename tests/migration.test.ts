import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../server/db/index.js';
import { hasLegacySchema, normalizeSearchKey } from '../server/db/migrations.js';
import { createTestConfig } from './helpers/fixtures.js';

const handles: Array<{ close: () => void }> = [];

afterEach(() => {
  while (handles.length > 0) handles.pop()?.close();
});

/** Base con el esquema real de la 1.2.2 (las tres tablas de estado). */
function createLegacyDatabase(dbPath: string): void {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE media_items (
      id INTEGER PRIMARY KEY,
      path TEXT UNIQUE,
      category TEXT,
      channel TEXT,
      kind TEXT,
      title TEXT,
      duration REAL DEFAULT 0,
      cover TEXT,
      created_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE playback_state (
      item_id INTEGER PRIMARY KEY,
      position REAL DEFAULT 0,
      watched INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL,
      favorite INTEGER DEFAULT 0
    );
    CREATE TABLE playback_history (
      path TEXT PRIMARY KEY,
      position REAL DEFAULT 0,
      watched INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL,
      favorite INTEGER DEFAULT 0
    );
    CREATE TABLE playback_by_path (
      path TEXT PRIMARY KEY,
      position REAL DEFAULT 0,
      watched INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL,
      favorite INTEGER DEFAULT 0
    );
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
  `);
  db.prepare(
    'INSERT INTO media_items (id, path, category, channel, kind, title, duration, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(1, 'Videos/Openings/uno.mp4', 'Videos', 'Openings', 'video', 'Uno', 0, '2026-08-01T10:00:00.000Z', '2026-08-01T10:00:00.000Z');
  db.prepare(
    'INSERT INTO media_items (id, path, category, channel, kind, title, duration, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(2, 'Videos/Openings/dos.mp4', 'Videos', 'Openings', 'video', 'Dos', 0, '2026-08-02T10:00:00.000Z', '2026-08-02T10:00:00.000Z');
  db.prepare(
    'INSERT INTO media_items (id, path, category, channel, kind, title, duration, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(3, 'Audio/Pokemon/Canción.mp3', 'Audio', 'Pokemon', 'audio', 'Canción', 0, '2026-08-03T10:00:00.000Z', '2026-08-03T10:00:00.000Z');

  // Visto por item_id, sin rastro en las otras tablas.
  db.prepare('INSERT INTO playback_state (item_id, position, watched, favorite, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    2,
    130.5,
    1,
    0,
    '2026-08-10T12:00:00.000Z',
  );
  // Posición y favorito por path.
  db.prepare('INSERT INTO playback_by_path (path, position, watched, favorite, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    'Videos/Openings/uno.mp4',
    42.25,
    0,
    1,
    '2026-08-11T09:00:00.000Z',
  );
  // Historial más antiguo: no debe pisar lo anterior salvo en lo que falte.
  db.prepare('INSERT INTO playback_history (path, position, watched, favorite, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    'Videos/Openings/uno.mp4',
    10,
    0,
    1,
    '2026-08-05T09:00:00.000Z',
  );
  db.prepare('INSERT INTO playback_history (path, position, watched, favorite, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    'Audio/Pokemon/Canción.mp3',
    5.5,
    0,
    0,
    '2026-08-12T09:00:00.000Z',
  );
  db.prepare("INSERT INTO sessions (token_hash, expires_at) VALUES ('viejo', 1)").run();
  db.close();
}

describe('migración desde el esquema 1.2.2', () => {
  it('conserva vistos, favoritos y posiciones fusionando las tres tablas', () => {
    const config = createTestConfig();
    createLegacyDatabase(config.dbPath);

    const legacy = new Database(config.dbPath, { readonly: true });
    expect(hasLegacySchema(legacy)).toBe(true);
    legacy.close();

    const { db, migration } = openDatabase(config.dbPath);
    handles.push(db);
    expect(migration.migrated).toBe(true);
    expect(migration.applied).toEqual([1]);

    const rows = db
      .prepare('SELECT path, position, duration, watched, favorite, updated_at FROM playback_state ORDER BY path')
      .all() as Array<{
      path: string;
      position: number;
      watched: number;
      favorite: number;
      updated_at: string;
    }>;
    expect(rows).toHaveLength(3);
    const byPath = new Map(rows.map((row) => [row.path, row]));

    const uno = byPath.get('Videos/Openings/uno.mp4');
    expect(uno).toMatchObject({ position: 42.25, watched: 0, favorite: 1, updated_at: '2026-08-11T09:00:00.000Z' });

    const dos = byPath.get('Videos/Openings/dos.mp4');
    expect(dos).toMatchObject({ position: 130.5, watched: 1, favorite: 0, updated_at: '2026-08-10T12:00:00.000Z' });

    const cancion = byPath.get('Audio/Pokemon/Canción.mp3');
    expect(cancion).toMatchObject({ position: 5.5, watched: 0, favorite: 0, updated_at: '2026-08-12T09:00:00.000Z' });

    // Los enlaces item_id se reconstruyen desde media_items.
    const linked = db
      .prepare('SELECT p.path AS path, m.id AS id FROM playback_state p JOIN media_items m ON m.id = p.item_id ORDER BY p.path')
      .all() as Array<{ path: string; id: number }>;
    expect(linked).toEqual([
      { path: 'Audio/Pokemon/Canción.mp3', id: 3 },
      { path: 'Videos/Openings/dos.mp4', id: 2 },
      { path: 'Videos/Openings/uno.mp4', id: 1 },
    ]);

    // El esquema nuevo está completo.
    expect(db.prepare('SELECT COUNT(*) AS total FROM media_items').get()).toEqual({ total: 3 });
    const columns = (db.prepare('PRAGMA table_info(media_items)').all() as Array<{ name: string }>).map((column) => column.name);
    for (const column of ['extension', 'width', 'height', 'size_bytes', 'file_mtime', 'added_at', 'scanned_at', 'search_key']) {
      expect(columns, column).toContain(column);
    }
    expect(
      db
        .prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name IN ('playback_by_path', 'playback_history')")
        .get(),
    ).toEqual({
      total: 0,
    });
    expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 1 }]);
  });

  it('hace copia de seguridad del .db antes de migrar', () => {
    const config = createTestConfig();
    createLegacyDatabase(config.dbPath);
    const { db } = openDatabase(config.dbPath);
    handles.push(db);
    const backups = readdirSync(config.dataDir).filter((name) => name.startsWith('mediaserver.db.bak-'));
    expect(backups.length).toBe(1);
    const backupPath = join(config.dataDir, backups[0] ?? '');
    expect(existsSync(backupPath)).toBe(true);

    // La copia conserva el esquema antiguo intacto.
    const backup = new Database(backupPath, { readonly: true });
    expect(hasLegacySchema(backup)).toBe(true);
    expect(backup.prepare('SELECT COUNT(*) AS total FROM playback_by_path').get()).toEqual({ total: 1 });
    backup.close();
  });

  it('no migra ni copia nada en una base nueva', () => {
    const config = createTestConfig();
    const { db, migration } = openDatabase(config.dbPath);
    handles.push(db);
    expect(migration.migrated).toBe(true);
    expect(migration.backupPath).toBeNull();
    expect(readdirSync(config.dataDir).filter((name) => name.includes('.bak-'))).toHaveLength(0);
    expect(db.prepare('SELECT COUNT(*) AS total FROM media_items').get()).toEqual({ total: 0 });
  });

  it('es idempotente: reabrir la base no vuelve a migrar', () => {
    const config = createTestConfig();
    createLegacyDatabase(config.dbPath);
    const first = openDatabase(config.dbPath);
    first.db.close();
    const second = openDatabase(config.dbPath);
    handles.push(second.db);
    expect(second.migration.migrated).toBe(false);
    expect(second.migration.applied).toEqual([]);
    expect(readdirSync(config.dataDir).filter((name) => name.startsWith('mediaserver.db.bak-'))).toHaveLength(1);
    expect(second.db.prepare('SELECT COUNT(*) AS total FROM playback_state').get()).toEqual({ total: 3 });
  });

  it('normaliza la clave de búsqueda sin acentos ni mayúsculas', () => {
    expect(normalizeSearchKey('Canción de Pokémon')).toBe('cancion de pokemon');
    expect(normalizeSearchKey('APERTURA')).toBe('apertura');
  });
});
