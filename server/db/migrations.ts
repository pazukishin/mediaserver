import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Database } from 'better-sqlite3';
import { INDEXES_SQL, TABLES_SQL } from './schema.js';

export type Migration = {
  version: number;
  description: string;
  run: (db: Database) => void;
};

/** Normaliza para búsquedas: minúsculas y sin acentos. */
export function normalizeSearchKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isoStamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

type TableInfo = { name: string };

function existingTables(db: Database): Set<string> {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as TableInfo[];
  return new Set(rows.map((row) => row.name));
}

/** Esquema 1.2.2: las tres tablas de estado que se fusionan en una sola. */
const LEGACY_STATE_TABLES = ['playback_state', 'playback_by_path', 'playback_history'] as const;

const LEGACY_SUFFIX = '_legacy_122';

/** Nombre temporal de una tabla antigua; `null` si no existe. */
function legacyName(tables: Set<string>, table: string): string | null {
  return tables.has(table) ? `${table}${LEGACY_SUFFIX}` : null;
}

export function hasLegacySchema(db: Database): boolean {
  const tables = existingTables(db);
  return LEGACY_STATE_TABLES.some((table) => tables.has(table)) && !tables.has('schema_migrations');
}

/** Copia de seguridad del fichero antes de migrar una base existente. */
export function backupDatabaseFile(dbPath: string, at: Date = new Date()): string | null {
  if (!existsSync(dbPath) || statSync(dbPath).size === 0) return null;
  const backupPath = `${dbPath}.bak-${isoStamp(at)}`;
  copyFileSync(dbPath, backupPath);
  return backupPath;
}

export const migrations: Migration[] = [
  {
    version: 1,
    description: 'Esquema 2.0.0 + fusión de las tablas de estado antiguas',
    run: (db) => {
      const tables = existingTables(db);
      // Se calculan ANTES de crear el esquema: a partir de ahí `hasLegacySchema`
      // ya no puede reconocer la base antigua (existe `schema_migrations`).
      const legacyTables: LegacyTables = {
        byPath: legacyName(tables, 'playback_by_path'),
        history: legacyName(tables, 'playback_history'),
        byItemId: legacyName(tables, 'playback_state'),
      };
      const hadLegacyState = Object.values(legacyTables).some((name) => name !== null);
      // Las tablas antiguas se apartan antes de crear el esquema nuevo: la
      // `playback_state` de 1.2.2 usa item_id y no puede convivir con la nueva.
      for (const table of LEGACY_STATE_TABLES) {
        if (tables.has(table)) db.exec(`ALTER TABLE ${table} RENAME TO ${table}${LEGACY_SUFFIX}`);
      }
      db.exec(TABLES_SQL);
      backfillItemColumns(db);
      db.exec(INDEXES_SQL);
      if (hadLegacyState) mergeLegacyPlaybackState(db, legacyTables);
      // El contenido antiguo ya vive en playback_state y el fichero .db original
      // queda copiado como .bak-<ISO>: las tablas temporales se descartan.
      for (const table of LEGACY_STATE_TABLES) db.exec(`DROP TABLE IF EXISTS ${table}${LEGACY_SUFFIX}`);
      db.prepare('INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(1, new Date().toISOString());
    },
  },
];

/** Añade las columnas que no existían en 1.2.2 y rellena lo imprescindible. */
function backfillItemColumns(db: Database): void {
  const columns = new Set((db.prepare('PRAGMA table_info(media_items)').all() as Array<{ name: string }>).map((column) => column.name));
  const additions: Array<[string, string]> = [
    ['extension', "TEXT NOT NULL DEFAULT ''"],
    ['width', 'INTEGER'],
    ['height', 'INTEGER'],
    ['size_bytes', 'INTEGER'],
    ['file_mtime', 'INTEGER'],
    ['added_at', 'TEXT'],
    ['scanned_at', 'TEXT'],
    ['search_key', "TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [name, definition] of additions) {
    if (!columns.has(name)) db.exec(`ALTER TABLE media_items ADD COLUMN ${name} ${definition}`);
  }
  db.exec(`
    UPDATE media_items SET added_at = COALESCE(NULLIF(added_at, ''), created_at, updated_at, datetime('now'))
      WHERE added_at IS NULL OR added_at = '';
    UPDATE media_items SET duration = COALESCE(duration, 0);
  `);
  backfillSearchKeys(db);
}

function backfillSearchKeys(db: Database): void {
  const rows = db.prepare("SELECT id, title FROM media_items WHERE search_key IS NULL OR search_key = ''").all() as Array<{
    id: number;
    title: string | null;
  }>;
  if (rows.length === 0) return;
  const update = db.prepare('UPDATE media_items SET search_key = ? WHERE id = ?');
  const transaction = db.transaction(() => {
    for (const row of rows) update.run(normalizeSearchKey(row.title ?? ''), row.id);
  });
  transaction();
}

type LegacyTables = {
  byPath: string | null;
  history: string | null;
  byItemId: string | null;
};

type LegacyStateRow = {
  path: string | null;
  position: number | null;
  duration: number | null;
  watched: number | null;
  favorite: number | null;
  play_count: number | null;
  watched_at: string | null;
  favorite_at: string | null;
  updated_at: string | null;
};

/**
 * Fusiona `playback_state` (por `item_id`), `playback_by_path` y
 * `playback_history` en la nueva `playback_state` (clave `path`).
 * Gana la fila con `updated_at` más reciente; a igualdad de campos se
 * conservan vistos, favoritos y posiciones.
 */
function mergeLegacyPlaybackState(db: Database, legacy: LegacyTables): void {
  const merged = new Map<string, LegacyStateRow>();

  const absorb = (row: LegacyStateRow): void => {
    const path = row.path;
    if (!path) return;
    const previous = merged.get(path);
    if (!previous || compareUpdatedAt(row.updated_at, previous.updated_at) >= 0) {
      merged.set(path, { ...row, path, favorite: row.favorite ?? previous?.favorite ?? 0, watched: row.watched ?? previous?.watched ?? 0 });
      return;
    }
    // La fila nueva no es la más reciente, pero puede aportar datos sueltos.
    if (previous.favorite === 0 && row.favorite === 1) previous.favorite = 1;
    if (previous.watched === 0 && row.watched === 1) previous.watched = 1;
    if ((previous.duration ?? 0) === 0 && (row.duration ?? 0) > 0) previous.duration = row.duration;
  };

  if (legacy.byPath) for (const row of db.prepare(`SELECT * FROM ${legacy.byPath}`).all() as LegacyStateRow[]) absorb(row);

  if (legacy.history) for (const row of db.prepare(`SELECT * FROM ${legacy.history}`).all() as LegacyStateRow[]) absorb(row);

  const byItemId = legacy.byItemId;
  if (byItemId) {
    const rows = db
      .prepare(
        `SELECT m.path AS path, s.position AS position, s.watched AS watched, s.favorite AS favorite, s.updated_at AS updated_at
         FROM ${byItemId} s JOIN media_items m ON m.id = s.item_id`,
      )
      .all() as LegacyStateRow[];
    for (const row of rows) absorb(row);
  }

  if (merged.size === 0) return;

  const insert = db.prepare(
    `INSERT INTO playback_state (path, item_id, position, duration, watched, favorite, play_count, watched_at, favorite_at, updated_at)
     VALUES (@path, @item_id, @position, @duration, @watched, @favorite, @play_count, @watched_at, @favorite_at, @updated_at)
     ON CONFLICT(path) DO UPDATE SET
       item_id = excluded.item_id,
       position = excluded.position,
       duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE playback_state.duration END,
       watched = excluded.watched,
       favorite = excluded.favorite,
       play_count = MAX(playback_state.play_count, excluded.play_count),
       watched_at = COALESCE(excluded.watched_at, playback_state.watched_at),
       favorite_at = COALESCE(excluded.favorite_at, playback_state.favorite_at),
       updated_at = excluded.updated_at
     WHERE excluded.updated_at >= playback_state.updated_at`,
  );
  const itemId = db.prepare('SELECT id FROM media_items WHERE path = ?');

  const transaction = db.transaction(() => {
    for (const row of merged.values()) {
      const found = itemId.get(row.path ?? '') as { id: number } | undefined;
      insert.run({
        path: row.path,
        item_id: found?.id ?? null,
        position: row.position ?? 0,
        duration: row.duration ?? 0,
        watched: row.watched ? 1 : 0,
        favorite: row.favorite ? 1 : 0,
        play_count: row.play_count ?? (row.watched ? 1 : 0),
        watched_at: row.watched_at ?? (row.watched ? (row.updated_at ?? null) : null),
        favorite_at: row.favorite_at ?? (row.favorite ? (row.updated_at ?? null) : null),
        updated_at: row.updated_at ?? new Date().toISOString(),
      });
    }
  });
  transaction();
}

function compareUpdatedAt(a: string | null, b: string | null): number {
  const left = a ?? '';
  const right = b ?? '';
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

export type MigrationResult = {
  fromVersion: number;
  toVersion: number;
  migrated: boolean;
  backupPath: string | null;
  applied: number[];
};

/**
 * Aplica las migraciones pendientes. Antes de tocar una base con datos con el
 * esquema antiguo hace una copia `.bak-<ISO>` del fichero.
 */
export function runMigrations(db: Database, dbPath: string, at: Date = new Date()): MigrationResult {
  mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const current = db.pragma('user_version', { simple: true }) as number;
  const legacy = hasLegacySchema(db);
  let backupPath: string | null = null;
  if (legacy) backupPath = backupDatabaseFile(dbPath, at);

  const applied: number[] = [];
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    migration.run(db);
    applied.push(migration.version);
  }
  const last = migrations.at(-1)?.version ?? current;
  if (last > current) db.pragma(`user_version = ${last}`);

  return { fromVersion: current, toVersion: last, migrated: applied.length > 0, backupPath, applied };
}
