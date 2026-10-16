import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

export const APP_VERSION = '2.0.0';

/** Error de configuración: el proceso no debe arrancar. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export type AppConfig = {
  port: number;
  host: string;
  mediaDir: string;
  dataDir: string;
  coversDir: string;
  dbPath: string;
  /** Directorio del cliente compilado (por defecto `dist/` en el cwd). */
  staticDir: string;
  mediaUser: string;
  mediaPassword: string;
  sessionSecret: string;
  trustProxy: boolean;
  scanConcurrency: number;
  logLevel: LogLevel;
  /** Certificado y clave para servir HTTPS (PWA instalable en Android). */
  tlsCert: string | null;
  tlsKey: string | null;
  tlsPort: number;
};

export type EnvSource = Record<string, string | undefined>;

function defaultDir(candidate: string, fallback: string): string {
  try {
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
  } catch {
    // Ruta ilegible o inaccesible: usamos el valor por defecto.
  }
  return resolve(process.cwd(), fallback);
}

function helpParagraph(): string {
  return [
    'Falta configuración obligatoria en el entorno (.env o docker-compose.yml):',
    '',
    '  MEDIA_PASSWORD  contraseña de acceso a la biblioteca (sin valor por defecto)',
    '  SESSION_SECRET  secreto de firma de la cookie de sesión (mínimo 32 caracteres)',
    '',
    'Genera un secreto válido con:',
    '',
    "  node -e \"console.log(require('node:crypto').randomBytes(32).toString('hex'))\"",
    '',
    'Ejemplo de .env (copia .env.example y edítalo):',
    '',
    '  MEDIA_PASSWORD=una-contraseña-larga-y-única',
    '  SESSION_SECRET=<el valor generado arriba>',
  ].join('\n');
}

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  MEDIA_DIR: z.string().min(1).optional(),
  DATA_DIR: z.string().min(1).optional(),
  STATIC_DIR: z.string().min(1).optional(),
  MEDIA_USER: z.string().min(1).default('media'),
  MEDIA_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  TRUST_PROXY: z.string().optional(),
  SCAN_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TLS_CERT: z.string().min(1).optional(),
  TLS_KEY: z.string().min(1).optional(),
  TLS_PORT: z.coerce.number().int().min(1).max(65_535).default(3443),
});

/**
 * Lee y valida las variables de entorno. Lanza `ConfigError` con instrucciones
 * en español si falta algo obligatorio o hay un valor imposible.
 */
export function loadConfig(env: EnvSource = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    // No incluimos el valor recibido: podría ser una credencial.
    const missing = parsed.error.issues.map((issue) => `  - ${issue.path.join('.') || '(raíz)'}: ${issue.message}`).join('\n');
    throw new ConfigError(`Configuración no válida.\n${helpParagraph()}\n\nDetalle técnico:\n${missing}`);
  }

  const values = parsed.data;
  const mediaDir = resolve(values.MEDIA_DIR ?? defaultDir('/media', 'media'));
  const dataDir = resolve(values.DATA_DIR ?? defaultDir('/data', 'data'));

  // HTTPS opcional: se activa sólo con las dos piezas. Una sola no sirve y es
  // casi seguro un error de configuración: mejor avisar que arrancar en HTTP
  // en silencio cuando el usuario esperaba HTTPS.
  const tlsCert = values.TLS_CERT ? resolve(values.TLS_CERT) : null;
  const tlsKey = values.TLS_KEY ? resolve(values.TLS_KEY) : null;
  if ((tlsCert === null) !== (tlsKey === null)) {
    throw new ConfigError('Configuración no válida.\nTLS_CERT y TLS_KEY deben definirse juntas (o ninguna de las dos).');
  }

  return {
    port: values.PORT,
    host: values.HOST,
    mediaDir,
    dataDir,
    coversDir: resolve(dataDir, 'covers'),
    dbPath: resolve(dataDir, 'mediaserver.db'),
    staticDir: resolve(values.STATIC_DIR ?? resolve(process.cwd(), 'dist')),
    mediaUser: values.MEDIA_USER,
    mediaPassword: values.MEDIA_PASSWORD,
    sessionSecret: values.SESSION_SECRET,
    trustProxy: values.TRUST_PROXY === '1' || values.TRUST_PROXY === 'true',
    scanConcurrency: values.SCAN_CONCURRENCY,
    logLevel: values.LOG_LEVEL,
    tlsCert,
    tlsKey,
    tlsPort: values.TLS_PORT,
  };
}
