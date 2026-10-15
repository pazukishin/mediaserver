import { describe, expect, test } from 'vitest';
import { isProbablyPlayable, mediaSource } from './media.js';
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
    // .mkv no está en la unión del reproductor: se declara como objeto genérico
    // en lugar de mentir con un MIME que no soporta.
    expect(mediaSource(item({ extension: '.mkv' })).type).toBe('video/object');
  });

  test('traduce las extensiones de audio', () => {
    expect(mediaSource(item({ kind: 'audio', extension: '.mp3' })).type).toBe('audio/mpeg');
    expect(mediaSource(item({ kind: 'audio', extension: '.flac' })).type).toBe('audio/flac');
    expect(mediaSource(item({ kind: 'audio', extension: '.opus' })).type).toBe('audio/ogg');
    expect(mediaSource(item({ kind: 'audio', extension: '.wav' })).type).toBe('audio/object');
  });

  test('usa la URL de streaming que sirve el servidor', () => {
    expect(mediaSource(item()).src).toBe('/api/stream/1');
  });
});

describe('isProbablyPlayable', () => {
  test('el audio siempre se intenta', () => {
    expect(isProbablyPlayable(item({ kind: 'audio', extension: '.flac' }))).toBe(true);
  });

  test('avisa de los contenedores que el navegador no sabe abrir', () => {
    expect(isProbablyPlayable(item({ extension: '.mkv' }))).toBe(false);
    expect(isProbablyPlayable(item({ extension: '.avi' }))).toBe(false);
    expect(isProbablyPlayable(item({ extension: '.mp4' }))).toBe(true);
  });
});
