import type { Item } from './types.js';

/**
 * Tipos que entiende Vidstack (su unión de MIME es cerrada). El servidor sigue
 * enviando el `Content-Type` real; esto sólo es la pista para elegir proveedor.
 */
export type PlayerMime =
  | 'audio/mpeg'
  | 'audio/ogg'
  | 'audio/flac'
  | 'audio/object'
  | 'video/mp4'
  | 'video/webm'
  | 'video/avi'
  | 'video/object';

export type MediaSource = { src: string; type: PlayerMime };

const AUDIO_TYPES: Record<string, PlayerMime> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/object',
  '.m4a': 'audio/object',
  '.aac': 'audio/object',
};

const VIDEO_TYPES: Record<string, PlayerMime> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/mp4',
  '.webm': 'video/webm',
  '.avi': 'video/avi',
  '.mkv': 'video/object',
};

/** Fuente reproducible para el reproductor. */
export function mediaSource(item: Item): MediaSource {
  const extension = item.extension.toLowerCase();
  const type = item.kind === 'video' ? VIDEO_TYPES[extension] : AUDIO_TYPES[extension];
  return { src: item.streamUrl, type: type ?? (item.kind === 'video' ? 'video/mp4' : 'audio/mpeg') };
}

/** Formatos que un navegador de escritorio reproduce de forma fiable. */
const PLAYABLE_VIDEO = new Set(['.mp4', '.webm', '.mov']);

export function isProbablyPlayable(item: Item): boolean {
  if (item.kind === 'audio') return true;
  return PLAYABLE_VIDEO.has(item.extension.toLowerCase());
}
