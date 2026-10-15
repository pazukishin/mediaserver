import { describe, expect, test } from 'vitest';
import { isProbablyPlayable, mediaSource, RECOGNISED_PLAYER_TYPES } from './media.js';
import type { Item } from './types.js';

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    title: 'Prueba',
    kind: 'video',
    category: 'Videos',
    channel: 'Openings',
    extension: '.mp4',
    duration: 120,
    position: 0,
    progress: 0,
    watched: false,
    favorite: false,
    createdAt: null,
    addedAt: null,
    watchedAt: null,
    favoriteAt: null,
    sizeBytes: null,
    streamUrl: '/api/stream/1',
    artworkUrl: null,
    previewUrl: null,
    ...overrides,
  };
}

describe('mediaSource', () => {
  test('traduce las extensiones de vídeo a los MIME que entiende el reproductor', () => {
    expect(mediaSource(item({ extension: '.mp4' })).type).toBe('video/mp4');
    expect(mediaSource(item({ extension: '.webm' })).type).toBe('video/webm');
    expect(mediaSource(item({ extension: '.avi' })).type).toBe('video/avi');
    expect(mediaSource(item({ extension: '.mov' })).type).toBe('video/mp4');
  });

  test('traduce las extensiones de audio', () => {
    expect(mediaSource(item({ kind: 'audio', extension: '.mp3' })).type).toBe('audio/mpeg');
    expect(mediaSource(item({ kind: 'audio', extension: '.flac' })).type).toBe('audio/flac');
    expect(mediaSource(item({ kind: 'audio', extension: '.opus' })).type).toBe('audio/ogg');
    expect(mediaSource(item({ kind: 'audio', extension: '.m4a' })).type).toBe('audio/mp4');
    expect(mediaSource(item({ kind: 'audio', extension: '.aac' })).type).toBe('audio/mp4');
  });

  test('usa la URL de streaming que sirve el servidor', () => {
    expect(mediaSource(item()).src).toBe('/api/stream/1');
  });

  /**
   * Regresión: `.m4a`, `.aac`, `.wav` y `.mkv` se declaraban como
   * `audio/object` / `video/object`, que en el reproductor sólo valen para URLs
   * `blob:`. Con una URL normal no montaba el elemento de medios y al pulsar
   * reproducir saltaba «media not ready». Todos los tipos declarados tienen que
   * estar en la lista que el reproductor reconoce de verdad.
   */
  test('ningún formato declara un tipo que el reproductor no reconozca', () => {
    const extensiones = ['.mp3', '.flac', '.ogg', '.opus', '.m4a', '.aac', '.wav', '.mp4', '.mov', '.webm', '.avi', '.mkv'];
    const desconocidos: string[] = [];
    for (const extension of extensiones) {
      for (const kind of ['audio', 'video'] as const) {
        const { type } = mediaSource(item({ kind, extension }));
        if (!RECOGNISED_PLAYER_TYPES.includes(type)) desconocidos.push(`${extension} → ${type}`);
      }
    }
    expect(desconocidos).toEqual([]);
  });

  test('un formato desconocido cae en un tipo reconocido, no en `object`', () => {
    expect(RECOGNISED_PLAYER_TYPES).toContain(mediaSource(item({ kind: 'audio', extension: '.rareza' })).type);
    expect(RECOGNISED_PLAYER_TYPES).toContain(mediaSource(item({ kind: 'video', extension: '.rareza' })).type);
  });
});

describe('isProbablyPlayable', () => {
  test('el audio siempre se intenta', () => {
    expect(isProbablyPlayable(item({ kind: 'audio', extension: '.flac' }))).toBe(true);
    expect(isProbablyPlayable(item({ kind: 'audio', extension: '.m4a' }))).toBe(true);
  });

  test('avisa de los contenedores que el navegador no sabe abrir', () => {
    expect(isProbablyPlayable(item({ extension: '.mkv' }))).toBe(false);
    expect(isProbablyPlayable(item({ extension: '.avi' }))).toBe(false);
    expect(isProbablyPlayable(item({ extension: '.mp4' }))).toBe(true);
  });
});
