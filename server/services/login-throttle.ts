/**
 * Limitador de intentos de acceso fallidos, por IP.
 *
 * Existe porque `@fastify/rate-limit` v11 no sabe contar sólo los fallos
 * (`skipSuccessfulRequests` no existe en esa versión y `skipOnError` significa
 * otra cosa: si el almacén falla, no propagar el error). Usarlo a pelo bloqueaba
 * también los accesos correctos: con un máximo de 5, el sexto login legítimo en
 * 15 minutos devolvía 429.
 *
 * El estado vive en la instancia de la aplicación (no en el módulo) para que
 * cada app y cada test tengan su propio contador.
 */
export type LoginThrottle = {
  /** ¿Ha agotado esta IP los intentos permitidos? */
  isBlocked: (ip: string) => boolean;
  /** Segundos que faltan para poder reintentar (0 si no está bloqueada). */
  retryAfterSeconds: (ip: string) => number;
  /** Suma un intento fallido. */
  recordFailure: (ip: string) => void;
  /** Un acceso correcto borra el historial de esa IP. */
  clear: (ip: string) => void;
};

export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

type Entry = { count: number; expiresAt: number };

export function createLoginThrottle(options: { maxFailures?: number; windowMs?: number; now?: () => number } = {}): LoginThrottle {
  const maxFailures = options.maxFailures ?? MAX_LOGIN_FAILURES;
  const windowMs = options.windowMs ?? LOGIN_WINDOW_MS;
  const now = options.now ?? Date.now;
  const failures = new Map<string, Entry>();

  /** Entrada vigente, podando la caducada. */
  const current = (ip: string): Entry | null => {
    const entry = failures.get(ip);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      failures.delete(ip);
      return null;
    }
    return entry;
  };

  return {
    isBlocked: (ip) => {
      const entry = current(ip);
      return entry !== null && entry.count >= maxFailures;
    },
    retryAfterSeconds: (ip) => {
      const entry = current(ip);
      return entry === null ? 0 : Math.max(1, Math.ceil((entry.expiresAt - now()) / 1000));
    },
    recordFailure: (ip) => {
      const entry = current(ip);
      // La ventana arranca con el primer fallo y no se amplía con los siguientes.
      if (entry) entry.count += 1;
      else failures.set(ip, { count: 1, expiresAt: now() + windowMs });
    },
    clear: (ip) => {
      failures.delete(ip);
    },
  };
}
