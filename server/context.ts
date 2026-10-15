import type { Database } from 'better-sqlite3';
import type { AppConfig } from './config.js';
import type { BinaryPayload } from './services/artwork-store.js';
import type { FfTools } from './services/ffprobe.js';
import type { LoginThrottle } from './services/login-throttle.js';
import type { Scanner } from './services/scanner.js';

/** Todo lo que las rutas necesitan, colgado de la instancia de Fastify. */
export type AppContext = {
  appConfig: AppConfig;
  db: Database;
  ffTools: FfTools;
  scanner: Scanner;
  loginThrottle: LoginThrottle;
  itemCount: () => number;
  mediaReadable: () => boolean;
  /** Lee un JPEG de `covers/`; null si no existe o no es legible. */
  readCover: (name: string) => BinaryPayload | null;
  /** Carátula del canal (último elemento con carátula o imagen de la carpeta). */
  latestChannelArtwork: (category: string, channel: string) => BinaryPayload | null;
  /** Genera (bajo demanda) la preview `index` y devuelve su nombre en `covers/`. */
  ensurePreview: (relativePath: string, duration: number, index: number) => Promise<string | null>;
};

declare module 'fastify' {
  interface FastifyInstance extends AppContext {}
}
