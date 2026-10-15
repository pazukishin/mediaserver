import { rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, login } from './helpers/app.js';
import { makeTestAudio, makeTestImage, makeTestVideo, writeFixtureFile } from './helpers/fixtures.js';

const openApps: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (openApps.length > 0) {
    const close = openApps.pop();
    if (close) await close();
  }
});

type Ctx = Awaited<ReturnType<typeof createTestApp>> & { cookie: string };

async function setup(): Promise<Ctx> {
  const built = await createTestApp({ scanConcurrency: 2 });
  openApps.push(built.close);
  const cookie = await login(built.app);
  return { ...built, cookie };
}

function itemCount(ctx: Ctx): number {
  return (ctx.app.db.prepare('SELECT COUNT(*) AS total FROM media_items').get() as { total: number }).total;
}

function stateCount(ctx: Ctx): number {
  return (ctx.app.db.prepare('SELECT COUNT(*) AS total FROM playback_state').get() as { total: number }).total;
}

async function scan(ctx: Ctx): Promise<void> {
  const response = await ctx.app.inject({ method: 'POST', url: '/api/scan', headers: { cookie: ctx.cookie } });
  expect([200, 409]).toContain(response.statusCode);
  await ctx.app.scanner.waitForIdle();
}

async function status(ctx: Ctx) {
  const response = await ctx.app.inject({ method: 'GET', url: '/api/scan/status', headers: { cookie: ctx.cookie } });
  expect(response.statusCode).toBe(200);
  return response.json();
}

describe('POST /api/scan y estado', () => {
  it('acepta el escaneo, informa del estado y rechaza uno simultáneo con 409', async () => {
    const ctx = await setup();
    const accepted = await ctx.app.inject({ method: 'POST', url: '/api/scan', headers: { cookie: ctx.cookie } });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().accepted).toBe(true);
    expect(typeof accepted.json().startedAt).toBe('string');

    const during = await status(ctx);
    expect(during.running).toBe(true);
    const again = await ctx.app.inject({ method: 'POST', url: '/api/scan', headers: { cookie: ctx.cookie } });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toMatch(/en curso/i);

    await ctx.app.scanner.waitForIdle();
    const after = await status(ctx);
    expect(after.running).toBe(false);
    expect(after.finishedAt).not.toBeNull();
    expect(after.error).toBeNull();
    expect(after.message).toMatch(/completado/i);
    expect(after).toMatchObject({ processed: 0, total: 0, added: 0, updated: 0, removed: 0 });
  });

  it('cancelar un escaneo en curso está soportado y no borra el catálogo', async () => {
    const ctx = await setup();
    for (let index = 0; index < 40; index += 1) writeFixtureFile(ctx.config.mediaDir, `Videos/Canal/video-${index}.mp4`);
    await scan(ctx);
    expect(itemCount(ctx)).toBe(40);

    // Escaneo nuevo: se acepta, se cancela en pleno vuelo y no se pierde nada.
    const accepted = await ctx.app.inject({ method: 'POST', url: '/api/scan', headers: { cookie: ctx.cookie } });
    expect(accepted.statusCode).toBe(200);
    const cancel = await ctx.app.inject({ method: 'POST', url: '/api/scan/cancel', headers: { cookie: ctx.cookie } });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().accepted).toBe(true);
    await ctx.app.scanner.waitForIdle();
    expect(itemCount(ctx)).toBe(40);
    const finalStatus = await status(ctx);
    expect(finalStatus.running).toBe(false);
    expect(finalStatus.error).toBeNull();

    // Sin escaneo activo la cancelación no hace nada.
    const idle = await ctx.app.inject({ method: 'POST', url: '/api/scan/cancel', headers: { cookie: ctx.cookie } });
    expect(idle.json()).toEqual({ accepted: false });
  });
});

describe('escaneo incremental', () => {
  it('no reprocesa lo que no ha cambiado, sí lo que cambia y conserva el id', async () => {
    const ctx = await setup();
    // Vídeo real: así se genera carátula y el segundo escaneo puede saltárselo.
    expect(makeTestVideo(`${ctx.config.mediaDir}/Videos/Openings/uno.mp4`)).toBe(true);
    await scan(ctx);
    const first = (await ctx.app.inject({ method: 'GET', url: '/api/items', headers: { cookie: ctx.cookie } })).json();
    const item = first.items[0];
    const addedAt = String(item.addedAt);

    await scan(ctx);
    const unchanged = await status(ctx);
    expect(unchanged).toMatchObject({ added: 0, updated: 0, removed: 0 });
    const after = (await ctx.app.inject({ method: 'GET', url: '/api/items', headers: { cookie: ctx.cookie } })).json();
    expect(after.total).toBe(1);
    expect(after.items[0].addedAt).toBe(addedAt);
    expect(after.items[0].id).toBe(item.id);

    writeFixtureFile(ctx.config.mediaDir, 'Videos/Openings/uno.mp4', 'contenido distinto y bastante más largo');
    await scan(ctx);
    const changed = await status(ctx);
    expect(changed.updated).toBe(1);
    expect(changed.added).toBe(0);
    const stillOne = (await ctx.app.inject({ method: 'GET', url: '/api/items', headers: { cookie: ctx.cookie } })).json();
    expect(stillOne.total).toBe(1);
    expect(stillOne.items[0].id).toBe(item.id);
  });

  // Regresión: las filas migradas de 1.2.2 se quedaban sin carátula para
  // siempre, porque el escaneo incremental las daba por buenas y no volvía a
  // intentarlo aunque la portada estuviera (o apareciera) en la carpeta.
  it('reintenta los elementos sin carátula hasta que aparece una', async () => {
    const ctx = await setup();
    const audio = `${ctx.config.mediaDir}/Audio/Pokemon/cancion.mp3`;
    expect(makeTestAudio(audio)).toBe(true);

    await scan(ctx);
    const first = (await ctx.app.inject({ method: 'GET', url: '/api/items', headers: { cookie: ctx.cookie } })).json();
    expect(first.items[0].artworkUrl).toBeNull();

    // La portada del álbum aparece DESPUÉS del primer escaneo, con el nombre
    // del disco y no `cover.jpg`.
    expect(makeTestImage(`${ctx.config.mediaDir}/Audio/Pokemon/pokemon total.jpg`)).toBe(true);
    await scan(ctx);

    const second = (await ctx.app.inject({ method: 'GET', url: '/api/items', headers: { cookie: ctx.cookie } })).json();
    expect(second.items[0].artworkUrl).not.toBeNull();
    const artwork = await ctx.app.inject({ method: 'GET', url: second.items[0].artworkUrl, headers: { cookie: ctx.cookie } });
    expect(artwork.statusCode).toBe(200);
    expect(artwork.headers['content-type']).toBe('image/jpeg');
  });

  it('elimina del catálogo los ficheros ausentes conservando su estado por path', async () => {
    const ctx = await setup();
    writeFixtureFile(ctx.config.mediaDir, 'Videos/Openings/uno.mp4');
    writeFixtureFile(ctx.config.mediaDir, 'Videos/Openings/dos.mp4');
    await scan(ctx);
    expect(itemCount(ctx)).toBe(2);

    const list = (await ctx.app.inject({ method: 'GET', url: '/api/items?sort=name', headers: { cookie: ctx.cookie } })).json();
    const victim = list.items.find((item: { title: string }) => item.title === 'dos');
    await ctx.app.inject({
      method: 'POST',
      url: `/api/items/${victim.id}/progress`,
      headers: { cookie: ctx.cookie, 'content-type': 'application/json' },
      payload: { position: 30, duration: 100 },
    });
    expect(stateCount(ctx)).toBe(1);

    rmSync(`${ctx.config.mediaDir}/Videos/Openings/dos.mp4`);
    await scan(ctx);

    expect(itemCount(ctx)).toBe(1);
    expect((await status(ctx)).removed).toBe(1);
    // El estado por path sobrevive al borrado por si el fichero vuelve.
    expect(stateCount(ctx)).toBe(1);
  });

  it('cataloga la raíz, las categorías y las subcarpetas de canal', async () => {
    const ctx = await setup();
    makeTestAudio(`${ctx.config.mediaDir}/Audio/Pokemon/raiz.mp3`);
    makeTestAudio(`${ctx.config.mediaDir}/Videos/Pokemon/otro.mp3`);
    writeFixtureFile(ctx.config.mediaDir, 'Videos/suelto.mp4');
    writeFixtureFile(ctx.config.mediaDir, 'Videos/Openings/profundo/nivel2/video.mp4');
    await scan(ctx);
    const body = (await ctx.app.inject({ method: 'GET', url: '/api/items?limit=10', headers: { cookie: ctx.cookie } })).json();
    expect(body.total).toBe(4);
    const byTitle = new Map(body.items.map((item: { title: string }) => [item.title, item] as const));
    expect(byTitle.get('raiz')).toMatchObject({ category: 'Audio', channel: 'Pokemon', kind: 'audio' });
    expect(byTitle.get('otro')).toMatchObject({ category: 'Videos', channel: 'Pokemon', kind: 'audio' });
    expect(byTitle.get('suelto')).toMatchObject({ category: 'Videos', channel: 'Sin Canal', kind: 'video' });
    expect(byTitle.get('video')).toMatchObject({ category: 'Videos', channel: 'Openings', kind: 'video' });
  });

  it('indexa ficheros sueltos en la raíz como Sin Categoría / Sin Canal', async () => {
    const ctx = await setup();
    writeFixtureFile(ctx.config.mediaDir, 'portada-suelta.mp3');
    await scan(ctx);
    const body = (await ctx.app.inject({ method: 'GET', url: '/api/items', headers: { cookie: ctx.cookie } })).json();
    expect(body.items[0]).toMatchObject({ category: 'Sin Categoría', channel: 'Sin Canal', kind: 'audio' });
  });
});
