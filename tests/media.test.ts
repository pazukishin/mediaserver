import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, login } from './helpers/app.js';
import { createTempDir, makeTestVideo } from './helpers/fixtures.js';

const openApps: Array<() => Promise<void>> = [];
let videoAvailable = false;

beforeAll(() => {
  videoAvailable = makeTestVideo(`${createTempDir()}/probe.mp4`);
});

afterEach(async () => {
  while (openApps.length > 0) {
    const close = openApps.pop();
    if (close) await close();
  }
});

type StreamCtx = {
  app: Awaited<ReturnType<typeof createTestApp>>['app'];
  cookie: string;
  id: number;
  size: number;
  close: () => Promise<void>;
};

async function setup(): Promise<StreamCtx> {
  const built = await createTestApp();
  openApps.push(built.close);
  const { app, config } = built;
  const made = makeTestVideo(`${config.mediaDir}/Videos/Openings/pelicula.mp4`);
  expect(made).toBe(true);
  // Segundo elemento para comprobar que el id no es el path.
  makeTestVideo(`${config.mediaDir}/Videos/Openings/otro.mp4`);

  const cookie = await login(app);
  const scan = await app.inject({ method: 'POST', url: '/api/scan', headers: { cookie } });
  expect(scan.statusCode).toBe(200);
  await app.scanner.waitForIdle();

  const list = (await app.inject({ method: 'GET', url: '/api/items?q=pelicula', headers: { cookie } })).json();
  const item = list.items[0];
  expect(item).toBeDefined();
  const detail = (await app.inject({ method: 'GET', url: `/api/items/${item.id}`, headers: { cookie } })).json();
  expect(detail.sizeBytes).toBeGreaterThan(0);
  return { app, cookie, id: item.id, size: detail.sizeBytes, close: built.close };
}

describe('GET /api/stream/:id', () => {
  it('exige sesión', async () => {
    const { app, id, close } = await setup();
    expect((await app.inject({ method: 'GET', url: `/api/stream/${id}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/stream/99999' })).statusCode).toBe(401);
    await close();
  });

  it('sirve el fichero completo con las cabeceras del contrato', async () => {
    const { app, cookie, id, size, close } = await setup();
    if (!videoAvailable) return;
    const response = await app.inject({ method: 'GET', url: `/api/stream/${id}`, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.headers['accept-ranges']).toBe('bytes');
    expect(response.headers['content-type']).toBe('video/mp4');
    expect(response.headers['content-disposition']).toBe('inline');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(Number(response.headers['content-length'])).toBe(size);
    expect(typeof response.headers.etag).toBe('string');
    expect(response.rawPayload.length).toBe(size);
    await close();
  });

  it('soporta Range (206) y responde 416 fuera de rango', async () => {
    const { app, cookie, id, size, close } = await setup();
    if (!videoAvailable) return;

    const partial = await app.inject({ method: 'GET', url: `/api/stream/${id}`, headers: { cookie, range: 'bytes=0-99' } });
    expect(partial.statusCode).toBe(206);
    expect(partial.headers['content-range']).toBe(`bytes 0-99/${size}`);
    expect(partial.headers['content-length']).toBe('100');
    expect(partial.rawPayload.length).toBe(100);

    const openEnded = await app.inject({ method: 'GET', url: `/api/stream/${id}`, headers: { cookie, range: 'bytes=100-' } });
    expect(openEnded.statusCode).toBe(206);
    expect(openEnded.headers['content-range']).toBe(`bytes 100-${size - 1}/${size}`);

    const suffix = await app.inject({ method: 'GET', url: `/api/stream/${id}`, headers: { cookie, range: 'bytes=-50' } });
    expect(suffix.statusCode).toBe(206);
    expect(suffix.headers['content-range']).toBe(`bytes ${size - 50}-${size - 1}/${size}`);

    const invalid = await app.inject({ method: 'GET', url: `/api/stream/${id}`, headers: { cookie, range: `bytes=${size}-` } });
    expect(invalid.statusCode).toBe(416);
    expect(invalid.headers['content-range']).toBe(`bytes */${size}`);

    const malformed = await app.inject({ method: 'GET', url: `/api/stream/${id}`, headers: { cookie, range: 'items=0-10' } });
    expect(malformed.statusCode).toBe(416);
    await close();
  });

  it('responde 304 con If-None-Match y atiende HEAD', async () => {
    const { app, cookie, id, size, close } = await setup();
    if (!videoAvailable) return;
    const first = await app.inject({ method: 'GET', url: `/api/stream/${id}`, headers: { cookie } });
    const etag = String(first.headers.etag);

    const notModified = await app.inject({ method: 'GET', url: `/api/stream/${id}`, headers: { cookie, 'if-none-match': etag } });
    expect(notModified.statusCode).toBe(304);
    expect(notModified.rawPayload.length).toBe(0);

    const head = await app.inject({ method: 'HEAD', url: `/api/stream/${id}`, headers: { cookie } });
    expect(head.statusCode).toBe(200);
    expect(Number(head.headers['content-length'])).toBe(size);
    expect(head.rawPayload.length).toBe(0);

    const headRange = await app.inject({ method: 'HEAD', url: `/api/stream/${id}`, headers: { cookie, range: 'bytes=0-9' } });
    expect(headRange.statusCode).toBe(206);
    expect(headRange.headers['content-range']).toBe(`bytes 0-9/${size}`);
    await close();
  });

  it('devuelve 400 con ids inválidos y 404 si el elemento no existe', async () => {
    const { app, cookie, close } = await setup();
    expect((await app.inject({ method: 'GET', url: '/api/stream/abc', headers: { cookie } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/stream/99999', headers: { cookie } })).statusCode).toBe(404);
    await close();
  });
});
