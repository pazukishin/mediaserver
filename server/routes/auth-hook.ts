import type { FastifyReply, FastifyRequest } from 'fastify';
import { findValidSession } from '../repositories/sessions.js';
import { readSessionToken, sendUnauthorized, sha256 } from '../security.js';

/**
 * Rutas públicas: el healthcheck, el login y la consulta de sesión.
 * `/api/session` responde `{ authenticated: false }` a quien no tiene cookie,
 * así que no puede exigir sesión (el cliente la usa para decidir si muestra
 * el formulario de acceso).
 */
export const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login', '/api/session']);

export function isPublicPath(url: string): boolean {
  return PUBLIC_PATHS.has(url.split('?')[0] ?? '');
}

/**
 * Hook global para todo `/api/…`: exige cookie `session` firmada y válida.
 * Todo lo que no esté en `PUBLIC_PATHS` queda cerrado por defecto.
 */
export async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (isPublicPath(request.url)) return;
  const token = readSessionToken(request, request.server);
  if (!token || !findValidSession(request.server.db, sha256(token))) sendUnauthorized(reply);
}
