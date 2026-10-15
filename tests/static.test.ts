import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { authed, createTestApp, login, type TestApp } from './helpers/app.js';
import { createTempDir } from './helpers/fixtures.js';

/** Build de mentira con la forma real de `dist/`. */
function makeFakeBuild(): string {
  const dist = join(createTempDir('mediaserver-dist-'), 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><html lang="es"><body><div id="root"></div></body></html>');
  writeFileSync(join(dist, 'assets', 'app-a1b2c3.js'), 'console.log("hola");');
  return dist;
}

/**
 * Regresión: el servidor se caía al servir `index.html` porque el hook
 * `setHeaders` de `@fastify/static` v10 recibe la respuesta de Fastify y no la
 * `ServerResponse` de Node (`raw.setHeader is not a function`). Ningún test
 * tocaba el servido del cliente, así que el fallo llegaba hasta producción con
 * toda la suite en verde.
 */
describe('servido del cliente compilado', () => {
  let built: TestApp | null = null;

  afterEach(async () => {
    await built?.close();
    built = null;
  });

  test('sirve index.html sin caché y los assets con caché inmutable', async () => {
    built = await createTestApp({ staticDir: makeFakeBuild() });

    const root = await built.app.inject({ method: 'GET', url: '/' });
    expect(root.statusCode).toBe(200);
    expect(root.headers['cache-control']).toBe('no-cache');
    expect(root.body).toContain('id="root"');

    const asset = await built.app.inject({ method: 'GET', url: '/assets/app-a1b2c3.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  test('las rutas del cliente devuelven el index, pero la API no', async () => {
    built = await createTestApp({ staticDir: makeFakeBuild() });
    const cookie = await login(built.app);

    const spa = await built.app.inject({ method: 'GET', url: '/biblioteca' });
    expect(spa.statusCode).toBe(200);
    expect(spa.body).toContain('id="root"');

    // La API nunca cae en el index: responde JSON.
    const api = await built.app.inject({ method: 'GET', url: '/api/no-existe', headers: authed(cookie) });
    expect(api.statusCode).toBe(404);
    expect(api.body).not.toContain('id="root"');
  });

  test('la ruta de datos nunca se sirve como estática', async () => {
    built = await createTestApp({ staticDir: makeFakeBuild() });
    const response = await built.app.inject({ method: 'GET', url: '/cache/covers/loquesea.jpg' });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('id="root"');
  });

  test('sin build sólo se atiende la API y el proceso sigue vivo', async () => {
    built = await createTestApp({ staticDir: join(createTempDir('mediaserver-sin-build-'), 'dist') });

    const root = await built.app.inject({ method: 'GET', url: '/' });
    expect(root.statusCode).toBe(404);

    // Y la API sigue respondiendo con normalidad.
    const health = await built.app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
  });

  /**
   * Regresión: `helmet` añadía por defecto `upgrade-insecure-requests` y HSTS.
   * La aplicación está pensada para servirse por HTTP en una red local, así que
   * la primera obligaba al navegador a pedir los recursos por HTTPS a un
   * servidor que sólo habla HTTP y la página quedaba en negro. En `localhost`
   * no se notaba, porque el navegador lo considera origen seguro y no tiene
   * nada que «ascender»; desde la LAN rompía el despliegue entero.
   */
  test('la seguridad no fuerza HTTPS, porque el servidor es HTTP en la red local', async () => {
    built = await createTestApp({ staticDir: makeFakeBuild() });

    const root = await built.app.inject({ method: 'GET', url: '/' });
    expect(root.statusCode).toBe(200);
    expect(root.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    expect(root.headers['strict-transport-security']).toBeUndefined();

    // Y sigue habiendo CSP, que es lo que de verdad protege.
    const csp = String(root.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
