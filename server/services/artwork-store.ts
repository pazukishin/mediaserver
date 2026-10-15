import { readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { Database } from 'better-sqlite3';

export type BinaryPayload = { data: Buffer; contentType: string };

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

export function contentTypeForImage(filePath: string): string {
  return IMAGE_CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** Lee un fichero de imagen dentro de `covers/`; null si no existe. */
export function readCoverFile(coversDir: string, name: string): BinaryPayload | null {
  try {
    const filePath = join(coversDir, name);
    const stats = statSync(filePath);
    if (!stats.isFile()) return null;
    return { data: readFileSync(filePath), contentType: contentTypeForImage(filePath) };
  } catch {
    return null;
  }
}

/** Lee una imagen arbitraria del árbol de medios. */
export function readImageFile(filePath: string): BinaryPayload | null {
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) return null;
    return { data: readFileSync(filePath), contentType: contentTypeForImage(filePath) };
  } catch {
    return null;
  }
}

export type ChannelArtworkLookup = {
  coversDir: string;
  db: Database;
  findLatest: (db: Database, category: string, channel: string) => { cover: string } | null;
  findChannelImage: (mediaDir: string, category: string, channel: string) => string | null;
  mediaDir: string;
};

/** Carátula del canal: último elemento con carátula o la imagen de su carpeta. */
export function channelArtwork(lookup: ChannelArtworkLookup, category: string, channel: string): BinaryPayload | null {
  const row = lookup.findLatest(lookup.db, category, channel);
  if (row) {
    const data = readCoverFile(lookup.coversDir, row.cover);
    if (data) return data;
  }
  const fallback = lookup.findChannelImage(lookup.mediaDir, category, channel);
  return fallback ? readImageFile(fallback) : null;
}
