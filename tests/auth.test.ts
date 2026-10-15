import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../server/config.js';
import { createTestApp, login } from './helpers/app.js';

const PASSWORD = 'contrasena-de-prueba';
const apps: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  while (apps.length > 0) {
    const built = apps.pop();
    if (built) await built.close();
  }
});

async function makeApp() {
  const built = await createTestApp();
  apps.push(built);
  return built;
}

describe('configuración obligatoria', () => {
  it('falla y explica cómo generar las credenciales si falta MEDIA_PASSWORD', () => {
    expect(() => loadConfig({ SESSION_SECRET: 'x'.repeat(40) })).toThrowError(ConfigError);
    expect(() => loadConfig({ SESSION_SECRET: 'x'.repeat(40) })).toThrowError(/MEDIA_PASSWORD/);
  });

  it('rechaza un SESSION_SECRET corto', () => {
    expect(() => loadConfig({ MEDIA_PASSWORD: 'algo', SESSION_SECRET: 'corto' })).toThrowError(/32/);
  });

  it('aplica valores por defecto razonables', () => {
    const config = loadConfig({ MEDIA_PASSWORD: 'algo', SESSION_SECRET: 'x'.repeat(40) });
    expect(config.port).toBe(3000);
    expect(config.mediaUser).toBe('media');
    expect(config.logLevel).toBe('info');
    expect(config.scanConcurrency).toBe(2);
    expect(config.trustProxy).toBe(false);
  });

  it('el mensaje de ayuda explica cómo generar el secreto y la contraseña', () => {
    try {
      loadConfig({ MEDIA_PASSWORD: 'algo', SESSION_SECRET: 'x'.repeat(10) });
      throw new Error('debería haber fallado');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      expect(message).toContain('MEDIA_PASSWORD');
      expect(message).toContain('randomBytes');
      expect(message).toContain('.env');
    }
  });
});

describe('GET /api/health', () => {
  it('responde sin sesión con el informe esperado', async () => {
    const { app, close } = await makeApp();
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ ok: true, version: '2.0.0' });
    expect(typeof body.uptimeSec).toBe('number');
    expect(typeof body.items).toBe('number');
    expect(typeof body.ffmpeg).toBe('boolean');
    expect(body.media.readable).toBe(true);
    expect(body.scan.running).toBe(false);
    await close();
  });
});

describe('POST /api/auth/login', () => {
  it('acepta las credenciales correctas y emite la cookie de sesión', async () => {
    const { app, close } = await makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'media', password: PASSWORD },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    const raw = response.headers['set-cookie'];
    const cookie = Array.isArray(raw) ? raw.join(';') : String(raw);
    expect(cookie).toContain('session=');
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toMatch(/Max-Age=2592000/i);
    await close();
  });

  it('rechaza la contraseña incorrecta con 401', async () => {
    const { app, close } = await makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'media', password: 'incorrecta' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toMatch(/incorrectos/i);
    await close();
  });

  it('rechaza el usuario incorrecto con 401', async () => {
    const { app, close } = await makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'otro', password: PASSWORD },
    });
    expect(response.statusCode).toBe(401);
    await close();
  });

  it('devuelve 400 si el cuerpo no valida', async () => {
    const { app, close } = await makeApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/no válidos/i);
    await close();
  });

  it('limita a 5 intentos fallidos por IP en 15 minutos', async () => {
    const { app, close } = await makeApp();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: { username: 'media', password: 'mal' },
      });
      expect(response.statusCode).toBe(401);
    }
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'media', password: 'mal' },
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error).toMatch(/demasiados|intentos/i);
    expect(blocked.headers['retry-after']).toBeDefined();
    await close();
  });

  // Regresión: el limitador contaba también los accesos correctos, así que el
  // sexto login legítimo en 15 minutos devolvía 429.
  it('no bloquea los accesos correctos, por muchos que se hagan', async () => {
    const { app, close } = await makeApp();
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: { username: 'media', password: PASSWORD },
      });
      expect(response.statusCode, `acceso correcto número ${attempt}`).toBe(200);
    }
    await close();
  });

  it('un acceso correcto borra los fallos acumulados', async () => {
    const { app, close } = await makeApp();
    const fail = () =>
      app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'content-type': 'application/json' },
        payload: { username: 'media', password: 'mal' },
      });

    for (let attempt = 0; attempt < 4; attempt += 1) expect((await fail()).statusCode).toBe(401);

    const good = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'media', password: PASSWORD },
    });
    expect(good.statusCode).toBe(200);

    // Con el contador limpio, otros cuatro fallos siguen siendo 401 y no 429.
    for (let attempt = 0; attempt < 4; attempt += 1) expect((await fail()).statusCode).toBe(401);
    await close();
  });
});

describe('sesión', () => {
  it('/api/session informa del estado y el logout la invalida', async () => {
    const { app, close } = await makeApp();
    const anonymous = await app.inject({ method: 'GET', url: '/api/session' });
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.json()).toMatchObject({ authenticated: false, version: '2.0.0' });

    const cookie = await login(app);
    const authenticated = await app.inject({ method: 'GET', url: '/api/session', headers: { cookie } });
    expect(authenticated.json().authenticated).toBe(true);

    const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ ok: true });

    const after = await app.inject({ method: 'GET', url: '/api/session', headers: { cookie } });
    expect(after.json().authenticated).toBe(false);
    await close();
  });

  it('rechaza cookies manipuladas', async () => {
    const { app, close } = await makeApp();
    const cookie = await login(app);
    const tampered = `${cookie}tampered`;
    const response = await app.inject({ method: 'GET', url: '/api/session', headers: { cookie: tampered } });
    expect(response.json().authenticated).toBe(false);
    await close();
  });
});

describe('rutas de medios', () => {
  it('devuelven 401 sin sesión', async () => {
    const { app, close } = await makeApp();
    const urls = [
      '/api/stream/1',
      '/api/items/1/artwork',
      '/api/items/1/artwork/preview?index=0',
      '/api/channels/artwork?category=X&channel=Y',
    ];
    for (const url of urls) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(401);
    }
    await close();
  });

  it('las rutas eliminadas ya no existen (ni siquiera autenticado)', async () => {
    const { app, close } = await makeApp();
    const cookie = await login(app);
    for (const url of ['/media/algo.mp4', '/cache/covers/algo.jpg']) {
      const response = await app.inject({ method: 'GET', url, headers: { cookie } });
      expect(response.statusCode, url).toBe(404);
    }
    await close();
  });

  it('el resto de /api también exige sesión', async () => {
    const { app, close } = await makeApp();
    for (const url of ['/api/items', '/api/home', '/api/categories', '/api/channels', '/api/scan/status', '/api/session-status-x']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(401);
    }
    const scan = await app.inject({ method: 'POST', url: '/api/scan' });
    expect(scan.statusCode).toBe(401);
    await close();
  });
});
