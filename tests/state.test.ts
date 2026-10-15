import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, login } from './helpers/app.js';
import { writeFixtureFile } from './helpers/fixtures.js';

const openApps: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (openApps.length > 0) {
    const close = openApps.pop();
    if (close) await close();
  }
});

/**
 * Ficheros vacíos: el escaneo indexa el catálogo sin ffprobe, así los tests de
 * progreso controlan la duración explícitamente y son deterministas.
 */
async function setup(): Promise<{ app: FastifyInstance; cookie: string; items: Record<string, { id: number; title: string }> }> {
  const built = await createTestApp();
  openApps.push(built.close);
  const { app, config } = built;
  writeFixtureFile(config.mediaDir, 'Videos/Openings/uno.mp4');
  writeFixtureFile(config.mediaDir, 'Videos/Openings/dos.mp4');
  writeFixtureFile(config.mediaDir, 'Audio/Suelto/cancion.mp3');

  const cookie = await login(app);
  const scan = await app.inject({ method: 'POST', url: '/api/scan', headers: { cookie } });
  expect(scan.statusCode).toBe(200);
  await app.scanner.waitForIdle();

  const list = (await app.inject({ method: 'GET', url: '/api/items?limit=10', headers: { cookie } })).json();
  const items: Record<string, { id: number; title: string }> = {};
  for (const item of list.items) items[item.title] = item;
  return { app, cookie, items };
}

function post(app: FastifyInstance, url: string, cookie: string, payload: Record<string, unknown>): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'POST', url, headers: { cookie, 'content-type': 'application/json' }, payload });
}

describe('POST /api/items/:id/progress', () => {
  it('calcula progress y lo acota a [0, duration]', async () => {
    const { app, cookie, items } = await setup();
    const id = items.uno?.id;

    const half = await post(app, `/api/items/${id}/progress`, cookie, { position: 50, duration: 100 });
    expect(half.statusCode).toBe(200);
    expect(half.json()).toEqual({ position: 50, progress: 0.5, watched: false });

    // Fuera de rango por arriba: se acota a la duración (y marca visto).
    const over = await post(app, `/api/items/${id}/progress`, cookie, { position: 150, duration: 100 });
    expect(over.json()).toMatchObject({ position: 0, progress: 0, watched: true });

    const back = await post(app, `/api/items/${id}/progress`, cookie, { position: 60, duration: 100 });
    expect(back.json().position).toBe(60);
    expect(back.json().progress).toBeCloseTo(0.6, 5);
    expect(back.json().watched).toBe(true);

    // Los negativos los rechaza la validación (400), no se recortan en silencio.
    const negative = await post(app, `/api/items/${id}/progress`, cookie, { position: -10, duration: 100 });
    expect(negative.statusCode).toBe(400);

    const veryNegative = await post(app, `/api/items/${id}/progress`, cookie, { position: -10 });
    expect(veryNegative.statusCode).toBe(400);
  });

  it('ignora la posición si no hay duración conocida', async () => {
    const { app, cookie, items } = await setup();
    const response = await post(app, `/api/items/${items.dos?.id}/progress`, cookie, { position: 120 });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ position: 0, progress: 0, watched: false });
  });

  it('marca visto automáticamente al superar el 90 % y reinicia la posición', async () => {
    const { app, cookie, items } = await setup();
    const id = items.uno?.id;
    await post(app, `/api/items/${id}/progress`, cookie, { position: 50, duration: 100 });

    const ninety = await post(app, `/api/items/${id}/progress`, cookie, { position: 90, duration: 100 });
    expect(ninety.json()).toMatchObject({ watched: true, position: 0, progress: 0 });

    const detail = await app.inject({ method: 'GET', url: `/api/items/${id}`, headers: { cookie } });
    expect(detail.json()).toMatchObject({ watched: true, position: 0, progress: 0 });
    expect(typeof detail.json().watchedAt).toBe('string');
  });

  it('valida el cuerpo con 400 y devuelve 404 si el elemento no existe', async () => {
    const { app, cookie, items } = await setup();
    const cases: Array<Record<string, unknown>> = [
      { position: -1 },
      { position: 'cincuenta' },
      { position: Number.NaN },
      { duration: 10 },
      {},
    ];
    for (const payload of cases) {
      const response = await post(app, `/api/items/${items.uno?.id}/progress`, cookie, payload);
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.json().error).toMatch(/no válidos/i);
    }
    const missing = await post(app, '/api/items/4242/progress', cookie, { position: 10 });
    expect(missing.statusCode).toBe(404);
  });
});

describe('POST /api/items/:id/watched y /favorite', () => {
  it('marcar como visto a mano reinicia la posición y es reversible', async () => {
    const { app, cookie, items } = await setup();
    const id = items.uno?.id;
    await post(app, `/api/items/${id}/progress`, cookie, { position: 30, duration: 100 });

    const watched = await post(app, `/api/items/${id}/watched`, cookie, { watched: true });
    expect(watched.statusCode).toBe(200);
    expect(watched.json()).toMatchObject({ watched: true, position: 0 });
    expect(typeof watched.json().watchedAt).toBe('string');

    const list = (await app.inject({ method: 'GET', url: '/api/items?filter=watched', headers: { cookie } })).json();
    expect(list.total).toBe(1);

    const unwatched = await post(app, `/api/items/${id}/watched`, cookie, { watched: false });
    expect(unwatched.json()).toMatchObject({ watched: false, watchedAt: null });
    expect((await app.inject({ method: 'GET', url: '/api/items?filter=watched', headers: { cookie } })).json().total).toBe(0);
  });

  it('alterna favoritos y valida el cuerpo', async () => {
    const { app, cookie, items } = await setup();
    const id = items.cancion?.id;
    const favorite = await post(app, `/api/items/${id}/favorite`, cookie, { favorite: true });
    expect(favorite.statusCode).toBe(200);
    expect(favorite.json().favorite).toBe(true);
    expect(typeof favorite.json().favoriteAt).toBe('string');

    expect((await app.inject({ method: 'GET', url: '/api/items?filter=favorite', headers: { cookie } })).json().total).toBe(1);

    const invalid = await post(app, `/api/items/${id}/favorite`, cookie, { favorite: 'si' });
    expect(invalid.statusCode).toBe(400);
    const missing = await post(app, '/api/items/9999/favorite', cookie, { favorite: true });
    expect(missing.statusCode).toBe(404);
  });
});

describe('POST /api/state/reset', () => {
  it('afecta de verdad a lo que se lee', async () => {
    const { app, cookie, items } = await setup();
    const first = items.uno?.id;
    const second = items.dos?.id;

    await post(app, `/api/items/${first}/progress`, cookie, { position: 40, duration: 100 });
    await post(app, `/api/items/${second}/watched`, cookie, { watched: true });
    await post(app, `/api/items/${second}/favorite`, cookie, { favorite: true });

    const resetProgress = await post(app, '/api/state/reset', cookie, { scope: 'progress' });
    expect(resetProgress.statusCode).toBe(200);
    expect(resetProgress.json()).toEqual({ ok: true, affected: 1 });

    const stateAfter = (await app.inject({ method: 'GET', url: '/api/items?limit=10', headers: { cookie } })).json().items;
    const firstAfter = stateAfter.find((item: { id: number }) => item.id === first);
    const secondAfter = stateAfter.find((item: { id: number }) => item.id === second);
    expect(firstAfter).toMatchObject({ position: 0, progress: 0, watched: false });
    // Un reset de progreso no borra vistos ni favoritos.
    expect(secondAfter).toMatchObject({ watched: true, favorite: true });

    const resetWatched = await post(app, '/api/state/reset', cookie, { scope: 'watched' });
    expect(resetWatched.json().affected).toBe(1);
    expect((await app.inject({ method: 'GET', url: '/api/items?filter=watched', headers: { cookie } })).json().total).toBe(0);

    const resetFavorite = await post(app, '/api/state/reset', cookie, { scope: 'favorite' });
    expect(resetFavorite.json().affected).toBe(1);
    expect((await app.inject({ method: 'GET', url: '/api/items?filter=favorite', headers: { cookie } })).json().total).toBe(0);

    const repeated = await post(app, '/api/state/reset', cookie, { scope: 'progress' });
    expect(repeated.json().affected).toBe(0);
  });

  it('el reset total limpia todo y valida el scope', async () => {
    const { app, cookie, items } = await setup();
    const id = items.uno?.id;
    await post(app, `/api/items/${id}/progress`, cookie, { position: 10, duration: 100 });
    await post(app, `/api/items/${id}/watched`, cookie, { watched: true });
    await post(app, `/api/items/${id}/favorite`, cookie, { favorite: true });

    const invalid = await post(app, '/api/state/reset', cookie, { scope: 'todo' });
    expect(invalid.statusCode).toBe(400);

    const all = await post(app, '/api/state/reset', cookie, { scope: 'all' });
    expect(all.json()).toEqual({ ok: true, affected: 1 });
    const detail = (await app.inject({ method: 'GET', url: `/api/items/${id}`, headers: { cookie } })).json();
    expect(detail).toMatchObject({ watched: false, favorite: false, position: 0, progress: 0, watchedAt: null, favoriteAt: null });
  });
});
