import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AppConfig } from '../server/config.js';
import { createTestApp, login, seedPlaybackState } from './helpers/app.js';
import { createTempDir, makeTestAudio, makeTestImage, makeTestVideo, writeFixtureFile } from './helpers/fixtures.js';

type Ctx = { app: FastifyInstance; config: AppConfig; close: () => Promise<void>; db: Database.Database; cookie: string };

let videoOk = false;
const openApps: Array<() => Promise<void>> = [];

beforeAll(() => {
  const probeDir = createTempDir();
  videoOk = makeTestVideo(`${probeDir}/probe.mp4`);
});

afterEach(async () => {
  while (openApps.length > 0) {
    const close = openApps.pop();
    if (close) await close();
  }
});

/**
 * Biblioteca de prueba:
 *   Vídeo/Openings/Apertura.mp4, Videos/Openings/Zeta.mp4 (copia del mismo vídeo)
 *   Videos/Documentales/uno.mp4, Videos/Documentales/dos.mp4
 *   Audio/Pokemon/uno.mp3, Audio/Pokemon/dos.mp3, Audio/Suelto.mp3
 */
async function setup(): Promise<Ctx> {
  const built = await createTestApp();
  const { config, app } = built;
  openApps.push(built.close);

  if (videoOk) {
    makeTestVideo(`${config.mediaDir}/Videos/Openings/Apertura.mp4`);
    makeTestVideo(`${config.mediaDir}/Videos/Openings/Zeta.mp4`);
    makeTestVideo(`${config.mediaDir}/Videos/Documentales/uno.mp4`);
    makeTestVideo(`${config.mediaDir}/Videos/Documentales/dos.mp4`);
  }
  makeTestAudio(`${config.mediaDir}/Audio/Pokemon/uno.mp3`);
  makeTestAudio(`${config.mediaDir}/Audio/Pokemon/dos.mp3`);
  makeTestAudio(`${config.mediaDir}/Audio/Suelto.mp3`);
  makeTestAudio(`${config.mediaDir}/Audio/Pokemon/tres.mp3`);
  // Imagen de la carpeta: es la carátula de los audios (paso 2 del contrato).
  makeTestImage(`${config.mediaDir}/Audio/Pokemon/cover.jpg`);
  writeFixtureFile(config.mediaDir, 'notas.txt', 'no soy multimedia');
  writeFixtureFile(config.mediaDir, 'Videos/Openings/portada.nfo', 'metadatos');

  const cookie = await login(app);
  const response = await app.inject({ method: 'POST', url: '/api/scan', headers: { cookie } });
  expect(response.statusCode).toBe(200);
  await app.scanner.waitForIdle();
  return { app, config, close: built.close, db: app.db, cookie };
}

function itemsQuery(params: Record<string, string | number> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) search.set(key, String(value));
  const query = search.toString();
  return query.length > 0 ? `/api/items?${query}` : '/api/items';
}

describe('escaneo + catálogo', () => {
  it('cataloga sólo multimedia y rellena la duración real', async () => {
    const { app, close, cookie } = await setup();
    const response = await app.inject({ method: 'GET', url: itemsQuery({ limit: 100 }), headers: { cookie } });
    const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body.total).toBe(8);
    expect(body.items).toHaveLength(8);
    expect(body.offset).toBe(0);
    expect(body.limit).toBe(100);
    const titles = body.items.map((item: { title: string }) => item.title);
    expect(titles).not.toContain('notas');
    expect(titles).not.toContain('portada');
    for (const item of body.items) {
      expect(item.duration).toBeGreaterThan(0);
      expect(item.streamUrl).toBe(`/api/stream/${item.id}`);
    }
    const video = body.items.find((item: { kind: string }) => item.kind === 'video');
    expect(video.artworkUrl).toBe(`/api/items/${video.id}/artwork`);
    expect(video.previewUrl).toBe(`/api/items/${video.id}/artwork/preview`);
    await close();
  });

  it('pagina sin materializar toda la biblioteca', async () => {
    const { app, close, cookie } = await setup();
    const first = (
      await app.inject({ method: 'GET', url: itemsQuery({ limit: 3, sort: 'name', dir: 'asc' }), headers: { cookie } })
    ).json();
    const second = (
      await app.inject({ method: 'GET', url: itemsQuery({ limit: 3, offset: 3, sort: 'name', dir: 'asc' }), headers: { cookie } })
    ).json();
    const third = (
      await app.inject({ method: 'GET', url: itemsQuery({ limit: 3, offset: 6, sort: 'name', dir: 'asc' }), headers: { cookie } })
    ).json();
    expect(first.total).toBe(8);
    expect(second.total).toBe(8);
    expect(first.items).toHaveLength(3);
    expect(second.items).toHaveLength(3);
    expect(third.items).toHaveLength(2);
    const ids = [...first.items, ...second.items, ...third.items].map((item: { id: number }) => item.id);
    expect(new Set(ids).size).toBe(8);
    const names = [...first.items, ...second.items, ...third.items].map((item: { title: string }) => item.title);
    expect(names).toEqual([...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
    await close();
  });

  it('filtra por categoría, canal, texto, visto, favorito y progreso', async () => {
    const { app, db, close, cookie } = await setup();
    const headers = { cookie };

    const byCategory = (await app.inject({ method: 'GET', url: itemsQuery({ category: 'Videos' }), headers: { cookie } })).json();
    expect(byCategory.total).toBe(4);
    const byChannel = (await app.inject({ method: 'GET', url: itemsQuery({ channel: 'Pokemon' }), headers: { cookie } })).json();
    expect(byChannel.total).toBe(3);
    const search = (await app.inject({ method: 'GET', url: itemsQuery({ q: 'APERTURA' }), headers: { cookie } })).json();
    expect(search.total).toBe(1);
    expect(search.items[0].title).toBe('Apertura');

    const target = (await app.inject({ method: 'GET', url: itemsQuery({ q: 'Apertura' }), headers: { cookie } })).json().items[0];
    const watched = await app.inject({
      method: 'POST',
      url: `/api/items/${target.id}/watched`,
      headers: { ...headers, 'content-type': 'application/json' },
      payload: { watched: true },
    });
    expect(watched.statusCode).toBe(200);
    const favorite = await app.inject({
      method: 'POST',
      url: `/api/items/${target.id}/favorite`,
      headers: { ...headers, 'content-type': 'application/json' },
      payload: { favorite: true },
    });
    expect(favorite.statusCode).toBe(200);

    expect((await app.inject({ method: 'GET', url: itemsQuery({ filter: 'watched' }), headers: { cookie } })).json().total).toBe(1);
    expect((await app.inject({ method: 'GET', url: itemsQuery({ filter: 'unwatched' }), headers: { cookie } })).json().total).toBe(7);
    expect((await app.inject({ method: 'GET', url: itemsQuery({ filter: 'favorite' }), headers: { cookie } })).json().total).toBe(1);

    const other = (await app.inject({ method: 'GET', url: itemsQuery({ q: 'Zeta' }), headers: { cookie } })).json().items[0];
    seedPlaybackState(db, 'Videos/Openings/Zeta.mp4', { position: 40, duration: 100 });
    expect((await app.inject({ method: 'GET', url: itemsQuery({ filter: 'progress' }), headers: { cookie } })).json().total).toBe(1);
    const progressItems = (await app.inject({ method: 'GET', url: itemsQuery({ filter: 'progress' }), headers: { cookie } })).json().items;
    expect(progressItems[0].id).toBe(other.id);
    expect(progressItems[0].progress).toBeCloseTo(0.4, 5);
    await close();
  });

  it('ordena por nombre, fecha, duración y vistos', async () => {
    const { app, db, close, cookie } = await setup();
    const byNameAsc = (await app.inject({ method: 'GET', url: itemsQuery({ sort: 'name', dir: 'asc' }), headers: { cookie } })).json()
      .items;
    const byNameDesc = (await app.inject({ method: 'GET', url: itemsQuery({ sort: 'name', dir: 'desc' }), headers: { cookie } })).json()
      .items;
    expect(byNameAsc.map((item: { title: string }) => item.title)).toEqual(
      [...byNameDesc].reverse().map((item: { title: string }) => item.title),
    );

    const byAddedDesc = (await app.inject({ method: 'GET', url: itemsQuery({ sort: 'added', dir: 'desc' }), headers: { cookie } })).json()
      .items;
    expect(byAddedDesc).toHaveLength(8);
    for (const item of byAddedDesc) expect(typeof item.addedAt).toBe('string');
    const firstAdded = String(byAddedDesc[0].addedAt);
    const lastAdded = String(byAddedDesc[byAddedDesc.length - 1].addedAt);
    expect(firstAdded >= lastAdded).toBe(true);

    const byDuration = (await app.inject({ method: 'GET', url: itemsQuery({ sort: 'duration', dir: 'desc' }), headers: { cookie } })).json()
      .items;
    expect(byDuration[0].duration).toBeGreaterThanOrEqual(byDuration[byDuration.length - 1].duration);

    seedPlaybackState(db, 'Audio/Pokemon/uno.mp3', { watched: 1 });
    const byWatched = (await app.inject({ method: 'GET', url: itemsQuery({ sort: 'watched', dir: 'desc' }), headers: { cookie } })).json()
      .items;
    expect(byWatched[0].title).toBe('uno');
    expect(byWatched[0].watched).toBe(true);
    const byWatchedAsc = (await app.inject({ method: 'GET', url: itemsQuery({ sort: 'watched', dir: 'asc' }), headers: { cookie } })).json()
      .items;
    expect(byWatchedAsc[byWatchedAsc.length - 1].title).toBe('uno');
    await close();
  });

  it('rechaza parámetros inválidos con 400', async () => {
    const { app, close, cookie } = await setup();
    const cases = [
      itemsQuery({ limit: 0 }),
      itemsQuery({ limit: 501 }),
      itemsQuery({ offset: -1 }),
      itemsQuery({ filter: 'inventado' }),
      itemsQuery({ sort: 'aleatorio' }),
      itemsQuery({ dir: 'arriba' }),
      '/api/items/abc',
      '/api/items/0',
    ];
    for (const url of cases) {
      const response = await app.inject({ method: 'GET', url, headers: { cookie } });
      expect(response.statusCode, url).toBe(400);
      expect(typeof response.json().error).toBe('string');
    }
    await close();
  });

  it('/api/items/:id y /api/items/:id/queue respetan el DTO', async () => {
    const { app, close, cookie } = await setup();
    const list = (await app.inject({ method: 'GET', url: itemsQuery({ channel: 'Pokemon', sort: 'name' }), headers: { cookie } })).json();
    const item = (await app.inject({ method: 'GET', url: `/api/items/${list.items[0].id}`, headers: { cookie } })).json();
    expect(item).toMatchObject({
      id: list.items[0].id,
      kind: 'audio',
      category: 'Audio',
      channel: 'Pokemon',
      extension: '.mp3',
      watched: false,
      favorite: false,
      streamUrl: `/api/stream/${list.items[0].id}`,
    });
    expect(item.previewUrl).toBeNull();
    expect(typeof item.addedAt).toBe('string');

    const queue = (await app.inject({ method: 'GET', url: `/api/items/${list.items[0].id}/queue`, headers: { cookie } })).json();
    expect(queue.ids).toEqual(list.items.map((entry: { id: number }) => entry.id));

    const missing = await app.inject({ method: 'GET', url: '/api/items/9999', headers: { cookie } });
    expect(missing.statusCode).toBe(404);
    await close();
  });

  it('/api/home, /api/categories y /api/channels resumen la biblioteca', async () => {
    const { app, close, cookie } = await setup();
    const home = (await app.inject({ method: 'GET', url: '/api/home', headers: { cookie } })).json();
    expect(home.stats.items).toBe(8);
    expect(home.stats.duration).toBeGreaterThan(0);
    expect(home.categories.map((category: { name: string }) => category.name).sort()).toEqual(['Audio', 'Videos']);
    expect(home.recentlyAdded.length).toBeGreaterThan(0);

    const categories = (await app.inject({ method: 'GET', url: '/api/categories', headers: { cookie } })).json().categories;
    const videos = categories.find((category: { name: string }) => category.name === 'Videos');
    expect(videos.items).toBe(4);
    expect(videos.watched).toBe(0);
    expect(videos.artworkUrl).toMatch(/^\/api\/items\/\d+\/artwork$/);

    const channels = (await app.inject({ method: 'GET', url: '/api/channels?category=Videos', headers: { cookie } })).json().channels;
    expect(channels.map((channel: { name: string }) => channel.name).sort()).toEqual(['Documentales', 'Openings']);
    expect(channels.every((channel: { category: string }) => channel.category === 'Videos')).toBe(true);
    await close();
  });

  it('el progreso alimenta "seguir viendo"', async () => {
    const { app, db, close, cookie } = await setup();
    seedPlaybackState(db, 'Videos/Documentales/uno.mp4', { position: 45, duration: 100 });
    const home = (await app.inject({ method: 'GET', url: '/api/home', headers: { cookie } })).json();
    expect(home.continueWatching).toHaveLength(1);
    expect(home.continueWatching[0].title).toBe('uno');
    expect(home.continueWatching[0].progress).toBeCloseTo(0.45, 5);
    await close();
  });
});

describe('carátulas', () => {
  it('genera carátula de vídeo y de audio en el escaneo', async () => {
    const { app, close, cookie } = await setup();
    const list = (await app.inject({ method: 'GET', url: itemsQuery({ limit: 100 }), headers: { cookie } })).json().items;
    const video = list.find((item: { kind: string }) => item.kind === 'video');
    const audio = list.find((item: { kind: string }) => item.kind === 'audio');

    const videoArt = await app.inject({ method: 'GET', url: video.artworkUrl, headers: { cookie } });
    if (videoOk) {
      expect(videoArt.statusCode).toBe(200);
      expect(videoArt.headers['content-type']).toBe('image/jpeg');
      expect(videoArt.rawPayload.length).toBeGreaterThan(500);
      expect(String(videoArt.headers['cache-control'])).toContain('immutable');
    }
    const audioArt = await app.inject({ method: 'GET', url: audio.artworkUrl, headers: { cookie } });
    expect(audioArt.statusCode).toBe(200);
    expect(audioArt.rawPayload.length).toBeGreaterThan(200);
    await close();
  });

  it('genera las previews de vídeo bajo demanda y las cachea', async () => {
    const { app, close, cookie } = await setup();
    const list = (await app.inject({ method: 'GET', url: itemsQuery({ limit: 100 }), headers: { cookie } })).json().items;
    const video = list.find((item: { kind: string }) => item.kind === 'video');
    if (!videoOk) return;
    const first = await app.inject({ method: 'GET', url: `/api/items/${video.id}/artwork/preview?index=0`, headers: { cookie } });
    expect(first.statusCode).toBe(200);
    expect(first.headers['content-type']).toBe('image/jpeg');
    const second = await app.inject({ method: 'GET', url: `/api/items/${video.id}/artwork/preview?index=0`, headers: { cookie } });
    expect(second.statusCode).toBe(200);
    expect(second.rawPayload.equals(first.rawPayload)).toBe(true);
    const outOfRange = await app.inject({ method: 'GET', url: `/api/items/${video.id}/artwork/preview?index=9`, headers: { cookie } });
    expect(outOfRange.statusCode).toBe(400);
    await close();
  });

  it('la carátula del canal usa la del último elemento', async () => {
    const { app, close, cookie } = await setup();
    const response = await app.inject({
      method: 'GET',
      url: '/api/channels/artwork?category=Videos&channel=Openings',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    const missing = await app.inject({ method: 'GET', url: '/api/channels/artwork?category=Nada&channel=Nadie', headers: { cookie } });
    expect(missing.statusCode).toBe(404);
    await close();
  });
});
