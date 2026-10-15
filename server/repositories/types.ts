import { extname } from 'node:path';

export type ItemKind = 'audio' | 'video';

export const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v', '.mpg', '.mpeg', '.ts', '.ogv']);
export const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.ogg', '.opus', '.wav', '.m4a', '.aac', '.wma', '.aiff']);
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'];

const MEDIA_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.ts': 'video/mp2t',
  '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wma': 'audio/x-ms-wma',
  '.aiff': 'audio/aiff',
};

export const DEFAULT_CATEGORY = 'Sin Categoría';
export const DEFAULT_CHANNEL = 'Sin Canal';

/** Provisional; el frontend reescribe el catálogo con el tiempo. */
export function mediaKind(extension: string): ItemKind | null {
  const normalized = extension.toLowerCase();
  if (VIDEO_EXTENSIONS.has(normalized)) return 'video';
  if (AUDIO_EXTENSIONS.has(normalized)) return 'audio';
  return null;
}

export function contentTypeFor(filePath: string): string {
  return MEDIA_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

export function kindOf(extension: string): ItemKind {
  return VIDEO_EXTENSIONS.has(extension.toLowerCase()) ? 'video' : 'audio';
}

export function nowIso(): string {
  return new Date().toISOString();
}
