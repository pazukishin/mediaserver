import Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../server/config.js';
import { type BuiltApp, buildApp } from '../../server/index.js';
import { createTestConfig } from './fixtures.js';

export { createTestConfig };

export type TestApp = BuiltApp & { app: FastifyInstance };

export async function createTestApp(overrides: Partial<AppConfig> = {}): Promise<TestApp> {
  const config = createTestConfig(overrides);
  const built = await buildApp(config);
  return built;
}

/** App + base abierta en sólo lectura para inspeccionar el estado. */
export async function createTestAppWithDb(overrides: Partial<AppConfig> = {}): Promise<TestApp & { openDb: () => Database.Database }> {
  const built = await createTestApp(overrides);
  return { ...built, openDb: () => new Database(built.config.dbPath, { readonly: true }) };
}

export const LOGIN_HEADERS = { 'content-type': 'application/json' } as const;

type InjectionResponse = { statusCode: number; headers: Record<string, unknown>; body: string; json: () => unknown; cookies: unknown[] };

/** Login y devuelve la cookie `session` lista para `headers.Cookie`. */
export async function login(app: FastifyInstance, password = 'contrasena-de-prueba', username = 'media'): Promise<string> {
  const response = (await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: LOGIN_HEADERS,
    payload: { username, password },
  })) as unknown as InjectionResponse;
  if (response.statusCode !== 200) throw new Error(`login falló con ${response.statusCode}: ${response.body}`);
  const setCookie = response.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (typeof raw !== 'string') throw new Error('login sin cabecera set-cookie');
  return raw.split(';')[0] ?? '';
}

export function authed(cookie: string): Record<string, string> {
  return { cookie };
}

/** Inserta una fila de estado directamente (tests deterministas de progreso). */
export function seedPlaybackState(
  db: Database.Database,
  path: string,
  state: { position?: number; duration?: number; watched?: number; favorite?: number } = {},
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO playback_state (path, item_id, position, duration, watched, favorite, play_count, watched_at, favorite_at, updated_at)
     VALUES (?, (SELECT id FROM media_items WHERE path = ?), ?, ?, ?, ?, 0, NULL, NULL, ?)`,
  ).run(path, path, state.position ?? 0, state.duration ?? 0, state.watched ?? 0, state.favorite ?? 0, now);
}

export async function loginAndGetCookie(app: FastifyInstance): Promise<string> {
  return login(app);
}
