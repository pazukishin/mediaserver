/**
 * Tipos compartidos con el servidor. Espejo de `docs/API.md`: si el contrato
 * cambia, cambia aquí también.
 */

export type MediaKind = 'audio' | 'video';

export type Item = {
  id: number;
  title: string;
  kind: MediaKind;
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

export type ItemFilter = 'all' | 'unwatched' | 'watched' | 'favorite' | 'progress';
export type ItemSort = 'name' | 'created' | 'added' | 'duration' | 'watched';
export type SortDirection = 'asc' | 'desc';

export type ItemQuery = {
  category?: string;
  channel?: string;
  q?: string;
  filter?: ItemFilter;
  sort?: ItemSort;
  dir?: SortDirection;
  offset?: number;
  limit?: number;
};

export type ItemPage = {
  items: Item[];
  total: number;
  offset: number;
  limit: number;
};

export type HomeData = {
  continueWatching: Item[];
  recentlyAdded: Item[];
  categories: CategorySummary[];
  stats: { items: number; watched: number; favorites: number; duration: number };
};

export type ScanStatus = {
  running: boolean;
  processed: number;
  total: number;
  currentFile: string;
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  added: number;
  updated: number;
  removed: number;
};

export type Health = {
  ok: boolean;
  version: string;
  uptimeSec: number;
  items: number;
  ffmpeg: boolean;
  media: { dir: string; readable: boolean };
  scan: { running: boolean };
};

export type ResetScope = 'progress' | 'watched' | 'favorite' | 'all';

export type ThemePreference = 'system' | 'dark' | 'light';
export type CardSize = 'compact' | 'cozy' | 'roomy';
