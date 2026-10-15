import { readFileSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { APP_VERSION, type AppConfig, ConfigError, loadConfig } from './config.js';
import type { AppContext } from './context.js';
import { closeDatabase, openDatabase } from './db/index.js';
import { countAllItems, latestCoverForChannel } from './repositories/items.js';
import { registerAuthRoutes } from './routes/auth.js';
import { requireSession } from './routes/auth-hook.js';
import { HttpError, validationError } from './routes/helpers.js';
import { registerItemRoutes } from './routes/items.js';
import { registerLibraryRoutes } from './routes/library.js';
import { registerMediaRoutes } from './routes/media.js';
import { registerScanRoutes } from './routes/scan.js';
import { ensurePreviews, findChannelImage } from './services/artwork.js';
import { channelArtwork, readCoverFile } from './services/artwork-store.js';
import { detectFfTools } from './services/ffprobe.js';
import { createLoginThrottle } from './services/login-throttle.js';
import { createScanner } from './services/scanner.js';

export type BuiltApp = {
  app: FastifyInstance;
  config: AppConfig;
  close: () => Promise<void>;
};

/**
 * Construye la aplicación completa sin abrir puertos (los tests usan
 * `app.inject()`). Deja la base abierta y las migraciones aplicadas.
 */
export async function buildApp(config: AppConfig = loadConfig()): Promise<BuiltApp> {
  const dbHandle = openDatabase(config.dbPath);
  const db = dbHandle.db;
  const ffTools = detectFfTools();

  const app = Fastify({
    logger: { level: config.logLevel },
    trustProxy: config.trustProxy,
    bodyLimit: 1_048_576,
  });

  const scanner = createScanner({
    db,
    mediaDir: config.mediaDir,
    coversDir: config.coversDir,
    concurrency: config.scanConcurrency,
    ffmpeg: ffTools.ffmpeg,
    ffprobe: ffTools.ffprobe,
    logger: {
      info: (data, message) => app.log.info(data, message),
      warn: (data, message) => app.log.warn(data, message),
      error: (data, message) => app.log.error(data, message),
    },
  });

  const context: AppContext = {
    appConfig: config,
    db,
    ffTools,
    scanner,
    loginThrottle: createLoginThrottle(),
    itemCount: () => {
      try {
        return countAllItems(db);
      } catch {
        return 0;
      }
    },
    mediaReadable: () => {
      try {
        return statSync(config.mediaDir).isDirectory();
      } catch {
        return false;
      }
    },
    readCover: (name) => readCoverFile(config.coversDir, name),
    latestChannelArtwork: (category, channel) =>
      channelArtwork(
        {
          coversDir: config.coversDir,
          mediaDir: config.mediaDir,
          db,
          findLatest: latestCoverForChannel,
          findChannelImage,
        },
        category,
        channel,
      ),
    ensurePreview: async (relativePath, duration, index) => {
      const names = await ensurePreviews(
        resolve(config.mediaDir, relativePath),
        relativePath,
        {
          coversDir: config.coversDir,
          mediaDir: config.mediaDir,
          ffmpeg: ffTools.ffmpeg,
          ffprobe: ffTools.ffprobe,
          logger: { info: () => {}, warn: (data, message) => app.log.warn(data, message) },
        },
        duration,
      );
      return names[index] ?? null;
    },
  };
  Object.assign(app, context);

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof z.ZodError) {
      const httpError = validationError(error);
      return reply.code(httpError.statusCode).send({ error: httpError.message });
    }
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: error.message });
    const fastifyError = error as { validation?: Array<{ message?: string }>; statusCode?: number; message?: string };
    if (fastifyError.validation) {
      const detail = fastifyError.validation.map((issue) => issue.message ?? 'valor no válido').join('; ');
      return reply.code(400).send({ error: `Parámetros no válidos (${detail})` });
    }
    const statusCode = typeof fastifyError.statusCode === 'number' && fastifyError.statusCode >= 400 ? fastifyError.statusCode : 500;
    if (statusCode >= 500) request.log.error({ err: error }, 'Error interno');
    else request.log.warn({ err: error }, 'Petición rechazada');
    return reply.code(statusCode).send({ error: statusCode >= 500 ? 'Error interno del servidor' : (fastifyError.message ?? 'Error') });
  });

  await app.register(cookie, { secret: config.sessionSecret });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await app.register(compress, { global: true, threshold: 1024 });
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () =>
      Object.assign(new Error('Demasiadas peticiones seguidas. Espera un momento antes de volver a intentarlo.'), {
        statusCode: 429,
        code: 'FST_ERR_RATE_LIMIT',
      }),
  });

  // Cierra por defecto: TODO /api excepto health y login pasa por aquí.
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    await requireSession(request, reply);
  });

  await registerAuthRoutes(app);
  await registerLibraryRoutes(app);
  await registerItemRoutes(app);
  await registerMediaRoutes(app);
  await registerScanRoutes(app);

  const distDir = registerStaticSite(app, config);
  setNotFoundHandler(app, distDir);

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await scanner.waitForIdle();
    await app.close();
    closeDatabase(db);
  };

  app.log.info(
    {
      app: 'MediaServer',
      version: APP_VERSION,
      node: process.version,
      mediaDir: config.mediaDir,
      dataDir: config.dataDir,
      host: config.host,
      port: config.port,
      ffmpeg: ffTools.ffmpeg,
      ffprobe: ffTools.ffprobe,
      migrated: dbHandle.migration.migrated,
      migratedFrom: dbHandle.migration.migrated ? dbHandle.migration.fromVersion : null,
      backup: dbHandle.migration.backupPath,
      scanConcurrency: config.scanConcurrency,
      logLevel: config.logLevel,
    },
    'MediaServer configurado',
  );

  return { app, config, close };
}

/** Sirve el SPA compilado si existe el build; nunca expone `data/`. */
function registerStaticSite(app: FastifyInstance, config: AppConfig): string | null {
  const distDir = config.staticDir;
  try {
    if (!statSync(distDir).isDirectory() || !statSync(resolve(distDir, 'index.html')).isFile()) throw new Error('sin build');
  } catch {
    app.log.warn({ distDir }, 'No hay build del cliente; sólo se sirve la API');
    return null;
  }

  // Los assets llevan hash en el nombre: se pueden cachear para siempre. El
  // index.html no, para que un despliegue nuevo se vea al recargar.
  const assetsRoot = `${resolve(distDir, 'assets')}${sep}`;

  void app.register(fastifyStatic, {
    root: distDir,
    prefix: '/',
    index: ['index.html'],
    // En @fastify/static v10 el primer argumento es la respuesta de Fastify, no
    // la `ServerResponse` de Node: hay que usar `reply.header()`.
    setHeaders: (reply, filePath) => {
      if (filePath.endsWith('.html')) reply.header('Cache-Control', 'no-cache');
      else if (filePath.startsWith(assetsRoot)) reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    },
  });

  return distDir;
}

/** 404 uniforme en JSON para la API; el SPA resuelve el resto si hay build. */
function setNotFoundHandler(app: FastifyInstance, distDir: string | null): void {
  app.setNotFoundHandler((request, reply) => {
    const reserved = request.url.startsWith('/api/') || request.url.startsWith('/media/') || request.url.startsWith('/cache/');
    const clientRoute = distDir !== null && !reserved && (request.method === 'GET' || request.method === 'HEAD');
    if (!clientRoute || distDir === null) return reply.code(404).send({ error: 'Recurso no encontrado' });
    try {
      return reply
        .type('text/html')
        .header('Cache-Control', 'no-cache')
        .send(readFileSync(resolve(distDir, 'index.html')));
    } catch {
      return reply.code(404).send({ error: 'Recurso no encontrado' });
    }
  });
}

async function main(): Promise<void> {
  let built: BuiltApp;
  try {
    built = await buildApp();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`\n[MediaServer] ${error.message}\n\n`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write(`\n[MediaServer] Error al arrancar: ${error instanceof Error ? error.message : String(error)}\n\n`);
    process.exitCode = 1;
    return;
  }

  const shutdown = async (signal: string): Promise<void> => {
    built.app.log.info({ signal }, 'Cerrando MediaServer');
    try {
      await built.close();
      process.exitCode = 0;
    } catch (error) {
      built.app.log.error({ err: error }, 'Error al cerrar');
      process.exitCode = 1;
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await built.app.listen({ port: built.config.port, host: built.config.host });
    built.app.log.info({ status: 'listening' }, 'MediaServer escuchando');
  } catch (error) {
    built.app.log.error({ err: error }, 'No se pudo abrir el puerto');
    await built.close();
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1] !== undefined && /server[\\/]index\.ts$|server[\\/]index\.js$/.test(process.argv[1]);
if (isDirectRun) await main();
