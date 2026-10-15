import type { FastifyInstance } from 'fastify';
import { APP_VERSION } from '../config.js';
import { deleteSession, findValidSession, insertSession, purgeExpiredSessions } from '../repositories/sessions.js';
import {
  clearSessionCookie,
  createSessionToken,
  readSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
  sha256,
  verifyCredentials,
} from '../security.js';
import { loginBodySchema, parseWith } from './helpers.js';

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const config = app.appConfig;
  purgeExpiredSessions(app.db);

  app.get('/api/health', async () => ({
    ok: true,
    version: APP_VERSION,
    uptimeSec: Math.round(process.uptime()),
    items: app.itemCount(),
    ffmpeg: app.ffTools.ffmpeg,
    media: { dir: config.mediaDir, readable: app.mediaReadable() },
    scan: { running: app.scanner.isRunning() },
  }));

  app.get('/api/session', async (request) => {
    const token = readSessionToken(request, app);
    return { authenticated: Boolean(token && findValidSession(app.db, sha256(token))), version: APP_VERSION };
  });

  app.post(
    '/api/auth/login',
    // El plugin es sólo un cortafuegos antiabuso sobre el total de peticiones
    // (no distingue aciertos de fallos). El control real de intentos fallidos
    // está en `loginThrottle`: 5 por IP cada 15 minutos.
    { config: { rateLimit: { max: 200, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const ip = request.ip;
      const throttle = app.loginThrottle;

      if (throttle.isBlocked(ip)) {
        const seconds = throttle.retryAfterSeconds(ip);
        return reply
          .code(429)
          .header('retry-after', seconds)
          .send({ error: `Demasiados intentos fallidos. Vuelve a intentarlo en ${Math.ceil(seconds / 60)} min.` });
      }

      const body = parseWith(loginBodySchema, request.body);
      if (!verifyCredentials(body.username, body.password, config.mediaUser, config.mediaPassword)) {
        throttle.recordFailure(ip);
        return reply.code(401).send({ error: 'Usuario o contraseña incorrectos' });
      }

      throttle.clear(ip);
      const token = createSessionToken();
      insertSession(app.db, sha256(token), Date.now() + SESSION_MAX_AGE_SECONDS * 1000, request.headers['user-agent'] ?? null);
      reply.setCookie(SESSION_COOKIE, token, { signed: true, ...sessionCookieOptions(config.trustProxy) });
      return { ok: true };
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    const token = readSessionToken(request, app);
    if (token) deleteSession(app.db, sha256(token));
    clearSessionCookie(reply);
    return { ok: true };
  });
}
