/**
 * Esquema SQL canónico (versión 2.0.0). Los cambios se aplican creando una
 * nueva entrada en `server/db/migrations.ts`, nunca editando este fichero.
 *
 * `TABLES_SQL` usa `CREATE TABLE IF NOT EXISTS`, así que sobre una base 1.2.2
 * respeta las tablas antiguas; `backfillItemColumns` añade las columnas que
 * falten y sólo después se crean los índices (`INDEXES_SQL`).
 */
export const SCHEMA_VERSION = 1;

export const TABLES_SQL = `
CREATE TABLE IF NOT EXISTS media_items (
  id            INTEGER PRIMARY KEY,
  path          TEXT NOT NULL UNIQUE,
  category      TEXT NOT NULL,
  channel       TEXT NOT NULL,
  kind          TEXT NOT NULL,
  title         TEXT NOT NULL,
  extension     TEXT NOT NULL DEFAULT '',
  duration      REAL NOT NULL DEFAULT 0,
  width         INTEGER,
  height        INTEGER,
  size_bytes    INTEGER,
  file_mtime    INTEGER,
  cover         TEXT,
  created_at    TEXT,
  added_at      TEXT NOT NULL DEFAULT '',
  updated_at    TEXT NOT NULL,
  scanned_at    TEXT,
  search_key    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS playback_state (
  path        TEXT PRIMARY KEY,
  item_id     INTEGER,
  position    REAL NOT NULL DEFAULT 0,
  duration    REAL NOT NULL DEFAULT 0,
  watched     INTEGER NOT NULL DEFAULT 0,
  favorite    INTEGER NOT NULL DEFAULT 0,
  play_count  INTEGER NOT NULL DEFAULT 0,
  watched_at  TEXT,
  favorite_at TEXT,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS scan_runs (
  id INTEGER PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  added INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  removed INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`;

export const INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_media_items_category_channel ON media_items (category, channel);
CREATE INDEX IF NOT EXISTS idx_media_items_added_at ON media_items (added_at);
CREATE INDEX IF NOT EXISTS idx_media_items_search ON media_items (search_key);
CREATE INDEX IF NOT EXISTS idx_playback_state_item_id ON playback_state (item_id);
CREATE INDEX IF NOT EXISTS idx_playback_state_watched ON playback_state (watched);
CREATE INDEX IF NOT EXISTS idx_playback_state_favorite ON playback_state (favorite);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
`;
