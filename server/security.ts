import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export const SESSION_COOKIE = 'session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 días

/** sha256 en hexadecimal: se usa para tokens y para hashes de caché. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Comparación en tiempo constante. Ambos valores se resumen con sha256 para
 * que la longitud no influya en el tiempo de respuesta (y para no filtrar
 * información por `timingSafeEqual` con buffers de distinto tamaño).
 */
export function safeEqual(given: string, expected: string): boolean {
  if (expected.length === 0) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Credenciales de login comparadas en tiempo constante. */
export function verifyCredentials(givenUser: string, givenPassword: string, expectedUser: string, expectedPassword: string): boolean {
  const userOk = safeEqual(givenUser, expectedUser);
  // Sin cortocircuito: se comparan siempre ambas para no filtrar cuál falló.
  const passwordOk = safeEqual(givenPassword, expectedPassword);
  return userOk && passwordOk;
}

/** Token de sesión en claro (nunca se guarda en la base: sólo su sha256). */
export function createSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export type SessionCookieOptions = {
  httpOnly: true;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
  secure: boolean;
};

export function sessionCookieOptions(secure: boolean): SessionCookieOptions {
  return { httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_MAX_AGE_SECONDS, secure };
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Cookie firmada válida → token en claro; si no, null. */
export function readSessionToken(request: FastifyRequest, app: FastifyInstance): string | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = app.unsignCookie(raw);
  return unsigned.valid ? unsigned.value : null;
}

/** Respuesta uniforme de falta de sesión. */
export function sendUnauthorized(reply: FastifyReply): FastifyReply {
  return reply.code(401).send({ error: 'No autorizado' });
}
