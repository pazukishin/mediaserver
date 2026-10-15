import type Database from 'better-sqlite3';
import { normalizeSearchKey } from '../db/migrations.js';
import { DEFAULT_CATEGORY, DEFAULT_CHANNEL, type ItemKind, VIDEO_EXTENSIONS } from './types.js';

export type SortKey = 'name' | 'created' | 'added' | 'duration' | 'watched';
export type SortDirection = 'asc' | 'desc';
export type ItemFilter = 'all' | 'unwatched' | 'watched' | 'favorite' | 'progress';

export const FILTERS: readonly ItemFilter[] = ['all', 'unwatched', 'watched', 'favorite', 'progress'];
export const SORTS: readonly SortKey[] = ['name', 'created', 'added', 'duration', 'watched'];

export type ItemQuery = {
  category?: string | undefined;
  channel?: string | undefined;
  q?: string | undefined;
  filter: ItemFilter;
  sort: SortKey;
  dir: SortDirection;
  offset: number;
  limit: number;
};

export type ItemStateRow = {
  path: string;
  id: number;
  title: string;
  kind: string;
  category: string;
  channel: string;
  extension: string;
  duration: number;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  cover: string | null;
  created_at: string | null;
  added_at: string | null;
  item_id: number | null;
  position: number | null;
  state_duration: number | null;
  watched: number | null;
  favorite: number | null;
  watched_at: string | null;
  favorite_at: string | null;
  state_updated_at: string | null;
};

export type Item = {
  id: number;
  title: string;
  kind: ItemKind;
  category: string;
  channel: string;
  extension: string;
  duration: number;
  position: number;
  progress: number;
  watched: boolean;
  favorite: boolean;
  createdAt: string | null;
  addedAt: string | null;
  watchedAt: string | null;
  favoriteAt: string | null;
  sizeBytes: number | null;
  streamUrl: string;
  artworkUrl: string | null;
  previewUrl: string | null;
};

export type CategorySummary = {
  name: string;
  items: number;
  watched: number;
  favorites: number;
  duration: number;
  artworkUrl: string | null;
  latestAt: string | null;
};

export type ChannelSummary = CategorySummary & { category: string };

export type LibraryStats = { items: number; watched: number; favorites: number; duration: number };

const JOIN = `
  FROM media_items m
  LEFT JOIN playback_state p ON p.path = m.path`;

const SELECT_FIELDS = `
  m.id, m.path, m.title, m.kind, m.category, m.channel, m.extension, m.duration, m.width, m.height,
  m.size_bytes, m.cover, m.created_at, m.added_at,
  p.item_id AS item_id, p.position AS position, p.duration AS state_duration,
  COALESCE(p.watched, 0) AS watched, COALESCE(p.favorite, 0) AS favorite,
  p.watched_at AS watched_at, p.favorite_at AS favorite_at, p.updated_at AS state_updated_at`;

/** Duración efectiva: la que midió ffprobe o la que trajo el reproductor. */
const EFFECTIVE_DURATION = 'MAX(COALESCE(m.duration, 0), COALESCE(p.duration, 0))';

export function toItem(row: ItemStateRow): Item {
  const duration = Math.max(row.duration ?? 0, row.state_duration ?? 0);
  const position = Math.max(row.position ?? 0, 0);
  const watched = Boolean(row.watched);
  const artworkUrl = row.cover ? `/api/items/${row.id}/artwork` : null;
  const isVideo = VIDEO_EXTENSIONS.has((row.extension || '').toLowerCase()) || row.kind === 'video';
  return {
    id: row.id,
    title: row.title,
    kind: row.kind === 'video' ? 'video' : 'audio',
    category: row.category,
    channel: row.channel,
    extension: row.extension,
    duration,
    position,
    progress: duration > 0 ? Math.min(Math.max(position / duration, 0), 1) : 0,
    watched,
    favorite: Boolean(row.favorite),
    createdAt: row.created_at,
    addedAt: row.added_at,
    watchedAt: row.watched_at ?? (watched ? row.state_updated_at : null),
    favoriteAt: row.favorite_at ?? (row.favorite ? row.state_updated_at : null),
    sizeBytes: row.size_bytes,
    streamUrl: `/api/stream/${row.id}`,
    artworkUrl,
    previewUrl: isVideo && artworkUrl ? `/api/items/${row.id}/artwork/preview` : null,
  };
}

function sortClause(sort: SortKey, dir: SortDirection): string {
  const direction = dir === 'desc' ? 'DESC' : 'ASC';
  switch (sort) {
    case 'created':
      return `ORDER BY (m.created_at IS NULL) ASC, m.created_at ${direction}, m.title COLLATE NOCASE ASC, m.id ASC`;
    case 'added':
      return `ORDER BY m.added_at ${direction}, m.title COLLATE NOCASE ASC, m.id ASC`;
    case 'duration':
      return `ORDER BY COALESCE(m.duration, 0) ${direction}, m.title COLLATE NOCASE ASC, m.id ASC`;
    case 'watched':
      // `asc` = no vistos primero; `desc` = vistos primero. El desempate por
      // título evita que el resultado dependa del orden de inserción.
      return `ORDER BY COALESCE(p.watched, 0) ${direction}, m.title COLLATE NOCASE ASC, m.id ASC`;
    default:
      return `ORDER BY m.title COLLATE NOCASE ${direction}, m.id ASC`;
  }
}

type WhereParts = { sql: string; params: unknown[] };

function buildWhere(query: Pick<ItemQuery, 'category' | 'channel' | 'q' | 'filter'>): WhereParts {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (query.category) {
    conditions.push('m.category = ?');
    params.push(query.category);
  }
  if (query.channel) {
    conditions.push('m.channel = ?');
    params.push(query.channel);
  }
  if (query.q && query.q.trim().length > 0) {
    conditions.push("m.search_key LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(normalizeSearchKey(query.q.trim()))}%`);
  }
  switch (query.filter) {
    case 'unwatched':
      conditions.push('COALESCE(p.watched, 0) = 0');
      break;
    case 'watched':
      conditions.push('COALESCE(p.watched, 0) = 1');
      break;
    case 'favorite':
      conditions.push('COALESCE(p.favorite, 0) = 1');
      break;
    case 'progress':
      conditions.push(
        'COALESCE(p.position, 0) > 30 AND COALESCE(p.watched, 0) = 0 AND ' +
          `(CASE WHEN ${EFFECTIVE_DURATION} > 0 THEN COALESCE(p.position, 0) / ${EFFECTIVE_DURATION} ELSE 0 END) < 0.95`,
      );
      break;
    default:
      break;
  }
  return { sql: conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '', params };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function countItems(db: Database.Database, query: Pick<ItemQuery, 'category' | 'channel' | 'q' | 'filter'>): number {
  const where = buildWhere(query);
  const row = db.prepare(`SELECT COUNT(*) AS total ${JOIN}${where.sql}`).get(...where.params) as { total: number };
  return row.total;
}

export function listItems(db: Database.Database, query: ItemQuery): Item[] {
  const where = buildWhere(query);
  const rows = db
    .prepare(`SELECT ${SELECT_FIELDS} ${JOIN}${where.sql} ${sortClause(query.sort, query.dir)} LIMIT ? OFFSET ?`)
    .all(...where.params, query.limit, query.offset) as ItemStateRow[];
  return rows.map(toItem);
}

export function findItemRow(db: Database.Database, id: number): ItemStateRow | undefined {
  return db.prepare(`SELECT ${SELECT_FIELDS} ${JOIN} WHERE m.id = ?`).get(id) as ItemStateRow | undefined;
}

export function findItemRowByPath(db: Database.Database, path: string): ItemStateRow | undefined {
  return db.prepare(`SELECT ${SELECT_FIELDS} ${JOIN} WHERE m.path = ?`).get(path) as ItemStateRow | undefined;
}

export function countAllItems(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) AS total FROM media_items').get() as { total: number };
  return row.total;
}

export function channelItemIds(db: Database.Database, category: string, channel: string): number[] {
  const rows = db
    .prepare('SELECT id FROM media_items WHERE category = ? AND channel = ? ORDER BY title COLLATE NOCASE ASC, id ASC')
    .all(category, channel) as Array<{ id: number }>;
  return rows.map((row) => row.id);
}

export function continueWatching(db: Database.Database, limit = 12): Item[] {
  const rows = db
    .prepare(
      `SELECT ${SELECT_FIELDS} ${JOIN}
       WHERE COALESCE(p.position, 0) > 30
         AND COALESCE(p.watched, 0) = 0
         AND (CASE WHEN ${EFFECTIVE_DURATION} > 0 THEN COALESCE(p.position, 0) / ${EFFECTIVE_DURATION} ELSE 0 END) < 0.95
       ORDER BY COALESCE(p.updated_at, m.added_at) DESC
       LIMIT ?`,
    )
    .all(limit) as ItemStateRow[];
  return rows.map(toItem);
}

export function recentlyAdded(db: Database.Database, limit = 12): Item[] {
  const rows = db.prepare(`SELECT ${SELECT_FIELDS} ${JOIN} ORDER BY m.added_at DESC, m.id DESC LIMIT ?`).all(limit) as ItemStateRow[];
  return rows.map(toItem);
}

type SummaryRow = {
  name: string;
  category?: string;
  items: number;
  watched: number;
  favorites: number;
  duration: number;
  latest_path: string | null;
  cover: string | null;
  latest_id: number | null;
  latest_at: string | null;
};

function summaryQuery(groupBy: 'category' | 'channel'): string {
  const partition = groupBy === 'category' ? 'm.category' : 'm.category, m.channel';
  const selectCategory = groupBy === 'channel' ? 'm.category AS category,' : '';
  const groupName = groupBy === 'category' ? 'm.category' : 'm.channel';
  return `
    WITH ranked AS (
      SELECT m.id AS latest_id, m.category AS category, m.channel AS channel, m.cover AS cover,
             COALESCE(m.created_at, m.added_at) AS latest_at,
             ROW_NUMBER() OVER (PARTITION BY ${partition} ORDER BY COALESCE(m.created_at, m.added_at) DESC, m.id DESC) AS rn
      FROM media_items m
      WHERE m.cover IS NOT NULL
    ),
    latest AS (
      SELECT r.category, r.channel, r.latest_id, r.cover, r.latest_at FROM ranked r WHERE r.rn = 1
    )
    SELECT ${selectCategory}
           ${groupName} AS name,
           COUNT(*) AS items,
           SUM(CASE WHEN COALESCE(p.watched, 0) = 1 THEN 1 ELSE 0 END) AS watched,
           SUM(CASE WHEN COALESCE(p.favorite, 0) = 1 THEN 1 ELSE 0 END) AS favorites,
           SUM(COALESCE(m.duration, 0)) AS duration,
           MAX(COALESCE(m.created_at, m.added_at)) AS latest_at,
           l.cover AS cover,
           l.latest_id AS latest_id
    FROM media_items m
    LEFT JOIN playback_state p ON p.path = m.path
    LEFT JOIN latest l ON l.category = m.category AND l.channel = m.channel
    GROUP BY ${partition}
    ORDER BY name COLLATE NOCASE ASC`;
}

function toSummary(row: SummaryRow, kind: 'category' | 'channel'): CategorySummary & { category?: string } {
  const artworkUrl = row.cover && row.latest_id !== null ? `/api/items/${row.latest_id}/artwork` : null;
  const summary: CategorySummary & { category?: string } = {
    name: row.name,
    items: row.items,
    watched: row.watched,
    favorites: row.favorites,
    duration: row.duration ?? 0,
    artworkUrl,
    latestAt: row.latest_at,
  };
  if (kind === 'channel') summary.category = row.category ?? DEFAULT_CATEGORY;
  return summary;
}

export function categorySummaries(db: Database.Database): CategorySummary[] {
  const rows = db.prepare(summaryQuery('category')).all() as SummaryRow[];
  return rows.map((row) => toSummary(row, 'category') as CategorySummary);
}

export function channelSummaries(db: Database.Database, category?: string): ChannelSummary[] {
  const rows = db.prepare(summaryQuery('channel')).all() as SummaryRow[];
  const filtered = category ? rows.filter((row) => row.category === category) : rows;
  return filtered.map((row) => toSummary(row, 'channel') as ChannelSummary);
}

export function latestCoverForChannel(db: Database.Database, category: string, channel: string): { id: number; cover: string } | null {
  const row = db
    .prepare(
      `SELECT id, cover FROM media_items
       WHERE category = ? AND channel = ? AND cover IS NOT NULL
       ORDER BY COALESCE(created_at, added_at) DESC, id DESC LIMIT 1`,
    )
    .get(category, channel) as { id: number; cover: string } | undefined;
  return row ?? null;
}

export function libraryStats(db: Database.Database): LibraryStats {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS items,
              SUM(CASE WHEN COALESCE(p.watched, 0) = 1 THEN 1 ELSE 0 END) AS watched,
              SUM(CASE WHEN COALESCE(p.favorite, 0) = 1 THEN 1 ELSE 0 END) AS favorites,
              SUM(COALESCE(m.duration, 0)) AS duration
       ${JOIN}`,
    )
    .get() as { items: number; watched: number | null; favorites: number | null; duration: number | null };
  return { items: row.items, watched: row.watched ?? 0, favorites: row.favorites ?? 0, duration: row.duration ?? 0 };
}

export { DEFAULT_CATEGORY, DEFAULT_CHANNEL, UMBRAL_VISTO_PROGRESS };

/** Alineado con `filter=progress` y con el marcado automático. */
const UMBRAL_VISTO_PROGRESS = 0.95;
