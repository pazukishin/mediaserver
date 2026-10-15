import type Database from 'better-sqlite3';
import { nowIso } from './types.js';

export type ScanStateRow = {
  path: string;
  item_id: number | null;
  position: number;
  duration: number;
  watched: number;
  favorite: number;
  play_count: number;
  watched_at: string | null;
  favorite_at: string | null;
  updated_at: string;
};

export type ProgressInput = {
  position: number;
  duration?: number | undefined;
};

export type ProgressResult = {
  position: number;
  progress: number;
  watched: boolean;
  watchedAt: string | null;
  duration: number;
};

export type WatchedResult = {
  watched: boolean;
  watchedAt: string | null;
  position: number;
};

export type FavoriteResult = {
  favorite: boolean;
  favoriteAt: string | null;
};

export type ResetScope = 'progress' | 'watched' | 'favorite' | 'all';

const UMBRAL_VISTO = 0.9;

function stateByPath(db: Database.Database, path: string): ScanStateRow | undefined {
  return db.prepare('SELECT * FROM playback_state WHERE path = ?').get(path) as ScanStateRow | undefined;
}

export function getStateByPath(db: Database.Database, path: string): ScanStateRow | undefined {
  return stateByPath(db, path);
}

function watchedAtOrNull(row: ScanStateRow | undefined): string | null {
  if (!row) return null;
  if (row.watched_at) return row.watched_at;
  return row.watched ? row.updated_at : null;
}

function favoriteAtOrNull(row: ScanStateRow | undefined): string | null {
  if (!row) return null;
  if (row.favorite_at) return row.favorite_at;
  return row.favorite ? row.updated_at : null;
}

/**
 * Registra progreso. `position` se acota a `[0, duration]`; si la duración es
 * 0 se ignora. Al superar el 90 % se marca visto y se reinicia la posición.
 */
export function updateProgress(db: Database.Database, path: string, input: ProgressInput, itemDuration = 0): ProgressResult {
  const current = stateByPath(db, path);
  const effectiveDuration = Math.max(input.duration ?? 0, itemDuration, current?.duration ?? 0);
  const previousPosition = current?.position ?? 0;
  const rawPosition = effectiveDuration > 0 ? Math.min(Math.max(input.position, 0), effectiveDuration) : previousPosition;
  const position = Number.isFinite(rawPosition) ? rawPosition : 0;
  const ratio = effectiveDuration > 0 ? position / effectiveDuration : 0;
  const reachedEnd = effectiveDuration > 0 && position > 0 && ratio >= UMBRAL_VISTO;
  const timestamp = nowIso();

  if (reachedEnd) {
    upsertState(db, path, {
      position: 0,
      duration: effectiveDuration,
      watched: 1,
      watchedAt: timestamp,
      playCount: (current?.play_count ?? 0) + 1,
      timestamp,
    });
    return { position: 0, progress: 0, watched: true, watchedAt: timestamp, duration: effectiveDuration };
  }

  upsertState(db, path, {
    position,
    duration: effectiveDuration,
    watched: current?.watched ?? 0,
    watchedAt: current?.watched_at ?? null,
    timestamp,
  });
  return {
    position,
    progress: effectiveDuration > 0 ? position / effectiveDuration : 0,
    watched: Boolean(current?.watched),
    watchedAt: watchedAtOrNull(current),
    duration: effectiveDuration,
  };
}

/** Marcar como visto a mano también reinicia la posición a 0. */
export function setWatched(db: Database.Database, path: string, watched: boolean): WatchedResult {
  const current = stateByPath(db, path);
  const timestamp = nowIso();
  const watchedAt = watched ? timestamp : null;
  const position = watched ? 0 : (current?.position ?? 0);
  upsertState(db, path, {
    position,
    duration: current?.duration ?? 0,
    watched: watched ? 1 : 0,
    watchedAt,
    playCount: watched && !current?.watched ? (current?.play_count ?? 0) + 1 : (current?.play_count ?? 0),
    timestamp,
  });
  return { watched, watchedAt, position };
}

export function setFavorite(db: Database.Database, path: string, favorite: boolean): FavoriteResult {
  const current = stateByPath(db, path);
  const timestamp = nowIso();
  const favoriteAt = favorite ? timestamp : null;
  upsertState(db, path, {
    position: current?.position ?? 0,
    duration: current?.duration ?? 0,
    watched: current?.watched ?? 0,
    watchedAt: current?.watched_at ?? null,
    favorite: favorite ? 1 : 0,
    favoriteAt,
    timestamp,
  });
  return { favorite, favoriteAt };
}

export function stateView(db: Database.Database, path: string): ProgressResult & FavoriteResult {
  const row = stateByPath(db, path);
  const duration = row?.duration ?? 0;
  const position = row?.position ?? 0;
  return {
    position,
    progress: duration > 0 ? position / duration : 0,
    watched: Boolean(row?.watched),
    watchedAt: watchedAtOrNull(row),
    favorite: Boolean(row?.favorite),
    favoriteAt: favoriteAtOrNull(row),
    duration,
  };
}

/**
 * Reset real sobre la tabla que usan las lecturas (`playback_state`).
 * Devuelve cuántas filas cambiaron de verdad.
 */
export function resetState(db: Database.Database, scope: ResetScope): number {
  const timestamp = nowIso();
  if (scope === 'progress') {
    // Un reset de progreso NO toca vistos ni favoritos.
    return db
      .prepare('UPDATE playback_state SET position = 0, updated_at = ? WHERE position > 0 AND watched = 0 AND favorite = 0')
      .run(timestamp).changes;
  }
  if (scope === 'watched') {
    return db
      .prepare('UPDATE playback_state SET watched = 0, watched_at = NULL, position = 0, updated_at = ? WHERE watched <> 0')
      .run(timestamp).changes;
  }
  if (scope === 'favorite') {
    return db.prepare('UPDATE playback_state SET favorite = 0, favorite_at = NULL, updated_at = ? WHERE favorite <> 0').run(timestamp)
      .changes;
  }
  // 'all': limpia progreso, vistos y favoritos de una vez.
  return db
    .prepare(
      'UPDATE playback_state SET position = 0, watched = 0, watched_at = NULL, favorite = 0, favorite_at = NULL, updated_at = ? WHERE position > 0 OR watched <> 0 OR favorite <> 0',
    )
    .run(timestamp).changes;
}

type UpsertInput = {
  position: number;
  duration: number;
  watched: number;
  watchedAt: string | null;
  favorite?: number;
  favoriteAt?: string | null;
  playCount?: number;
  timestamp: string;
};

function upsertState(db: Database.Database, path: string, input: UpsertInput): void {
  const item = db.prepare('SELECT id FROM media_items WHERE path = ?').get(path) as { id: number } | undefined;
  db.prepare(
    `INSERT INTO playback_state (path, item_id, position, duration, watched, favorite, play_count, watched_at, favorite_at, updated_at)
     VALUES (@path, @itemId, @position, @duration, @watched, @favorite, @playCount, @watchedAt, @favoriteAt, @updatedAt)
     ON CONFLICT(path) DO UPDATE SET
       item_id = excluded.item_id,
       position = excluded.position,
       duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE playback_state.duration END,
       watched = excluded.watched,
       favorite = excluded.favorite,
       play_count = excluded.play_count,
       watched_at = excluded.watched_at,
       favorite_at = excluded.favorite_at,
       updated_at = excluded.updated_at`,
  ).run({
    path,
    itemId: item?.id ?? null,
    position: input.position,
    duration: input.duration,
    watched: input.watched,
    favorite: input.favorite ?? 0,
    playCount: input.playCount ?? 0,
    watchedAt: input.watchedAt,
    favoriteAt: input.favoriteAt ?? null,
    updatedAt: input.timestamp,
  });
}

export { UMBRAL_VISTO };
