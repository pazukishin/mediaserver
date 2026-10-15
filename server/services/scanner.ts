import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import type { Database } from 'better-sqlite3';
import { normalizeSearchKey } from '../db/migrations.js';
import { finishScanRun, startScanRun } from '../repositories/scans.js';
import { DEFAULT_CATEGORY, DEFAULT_CHANNEL, type ItemKind, mediaKind, nowIso } from '../repositories/types.js';
import { type CoverContext, generateCover } from './artwork.js';
import { probeMedia } from './ffprobe.js';

export type ScanLogger = {
  info: (data: object, message: string) => void;
  warn: (data: object, message: string) => void;
  error: (data: object, message: string) => void;
};

export type ScanStatus = {
  running: boolean;
  processed: number;
  total: number;
  currentFile: string;
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  added: number;
  updated: number;
  removed: number;
};

export type ExistingItem = {
  path: string;
  kind: string;
  duration: number;
  cover: string | null;
  fileMtime: number | null;
  sizeBytes: number | null;
};

export type ScannerPiece = {
  relativePath: string;
  category: string;
  channel: string;
  kind: ItemKind;
  title: string;
  extension: string;
  duration: number;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  fileMtime: number | null;
  cover: string | null;
  createdAt: string;
  addedAt: string;
  scannedAt: string;
};

export type ScannerServices = {
  probe: (filePath: string, ffprobeAvailable: boolean) => Promise<{ duration: number; width: number | null; height: number | null }>;
  cover: (filePath: string, relativePath: string, kind: ItemKind, context: CoverContext, duration: number) => Promise<string | null>;
};

export type ScannerDeps = {
  db: Database;
  mediaDir: string;
  coversDir: string;
  concurrency: number;
  ffmpeg: boolean;
  ffprobe: boolean;
  logger: ScanLogger;
  services?: Partial<ScannerServices>;
};

type ScannedFile = {
  fullPath: string;
  relativePath: string;
  category: string;
  channel: string;
  kind: ItemKind;
  extension: string;
  title: string;
  sizeBytes: number;
  fileMtimeMs: number;
  createdAt: string;
};

const WRITE_BATCH = 100;

function emptyStatus(): ScanStatus {
  return {
    running: false,
    processed: 0,
    total: 0,
    currentFile: '',
    message: 'Sin escaneo activo',
    startedAt: null,
    finishedAt: null,
    error: null,
    added: 0,
    updated: 0,
    removed: 0,
  };
}

export type Scanner = {
  status: () => ScanStatus;
  start: () => { accepted: boolean; startedAt: string; reason?: string };
  cancel: () => boolean;
  isRunning: () => boolean;
  waitForIdle: () => Promise<void>;
};

/**
 * Escáner incremental y cancelable. Sólo procesa ficheros nuevos o cuyo `mtime`
 * o tamaño hayan cambiado; borra del catálogo los ausentes y cede el bucle de
 * eventos entre lotes (`setImmediate`). Las previews de vídeo no se generan
 * aquí: se crean bajo demanda al pedirlas.
 */
export function createScanner(deps: ScannerDeps): Scanner {
  const db = deps.db;
  const logger = deps.logger;
  const services: ScannerServices = {
    probe: probeMedia,
    cover: generateCover,
    ...deps.services,
  };

  const status: ScanStatus = emptyStatus();
  let running: Promise<void> | null = null;
  let cancelled = false;

  async function walk(directory: string, category: string, channel: string, files: ScannedFile[]): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      logger.warn({ directory, error: error instanceof Error ? error.message : String(error) }, 'Carpeta ilegible; se omite');
      return;
    }
    for (const entry of entries) {
      if (cancelled) return;
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        // La raíz es la categoría y el primer nivel dentro de ella es el canal.
        if (directory === deps.mediaDir) await walk(fullPath, entry.name, DEFAULT_CHANNEL, files);
        else if (directory === join(deps.mediaDir, category) && channel === DEFAULT_CHANNEL)
          await walk(fullPath, category, entry.name, files);
        else await walk(fullPath, category, channel, files);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = extname(entry.name).toLowerCase();
      const kind = mediaKind(extension);
      if (!kind) continue;
      let stats: Awaited<ReturnType<typeof stat>>;
      try {
        stats = await stat(fullPath);
      } catch {
        continue;
      }
      files.push({
        fullPath,
        relativePath: relative(deps.mediaDir, fullPath).split('\\').join('/'),
        category,
        channel,
        kind,
        extension,
        title: entry.name.slice(0, entry.name.length - extension.length) || entry.name,
        sizeBytes: stats.size,
        fileMtimeMs: Math.round(stats.mtimeMs),
        createdAt: (stats.birthtimeMs > 0 ? stats.birthtime : stats.mtime).toISOString(),
      });
    }
  }

  function existingItems(): Map<string, ExistingItem> {
    const rows = db.prepare('SELECT path, kind, duration, cover, file_mtime, size_bytes FROM media_items').all() as Array<{
      path: string;
      kind: string;
      duration: number;
      cover: string | null;
      file_mtime: number | null;
      size_bytes: number | null;
    }>;
    const map = new Map<string, ExistingItem>();
    for (const row of rows) {
      map.set(row.path, {
        path: row.path,
        kind: row.kind,
        duration: row.duration,
        cover: row.cover,
        fileMtime: row.file_mtime,
        sizeBytes: row.size_bytes,
      });
    }
    return map;
  }

  function isUnchanged(file: ScannedFile, existing: ExistingItem | undefined): boolean {
    if (!existing) return false;
    return existing.fileMtime === file.fileMtimeMs && existing.sizeBytes === file.sizeBytes && existing.kind === file.kind;
  }

  async function processFile(file: ScannedFile, existing: ExistingItem | undefined, context: CoverContext): Promise<ScannerPiece> {
    const { duration, width, height } = await services.probe(file.fullPath, deps.ffprobe);
    // Si ffprobe no da duración se conserva la que ya conocía el reproductor.
    const effectiveDuration = duration > 0 ? duration : (existing?.duration ?? 0);
    const cover = await services.cover(file.fullPath, file.relativePath, file.kind, context, effectiveDuration);
    const previousCover = existing?.cover ?? null;
    return {
      relativePath: file.relativePath,
      category: file.category,
      channel: file.channel,
      kind: file.kind,
      title: file.title,
      extension: file.extension,
      duration: effectiveDuration,
      width,
      height,
      sizeBytes: file.sizeBytes,
      fileMtime: file.fileMtimeMs,
      cover: cover ?? previousCover,
      createdAt: file.createdAt,
      addedAt: nowIso(),
      scannedAt: nowIso(),
    };
  }

  function writePieces(pieces: ScannerPiece[]): void {
    if (pieces.length === 0) return;
    const upsert = db.prepare(
      `INSERT INTO media_items
         (path, category, channel, kind, title, extension, duration, width, height, size_bytes, file_mtime, cover, created_at, added_at, updated_at, scanned_at, search_key)
       VALUES
         (@path, @category, @channel, @kind, @title, @extension, @duration, @width, @height, @sizeBytes, @fileMtime, @cover, @createdAt, @addedAt, @updatedAt, @scannedAt, @searchKey)
       ON CONFLICT(path) DO UPDATE SET
         category = excluded.category,
         channel = excluded.channel,
         kind = excluded.kind,
         title = excluded.title,
         extension = excluded.extension,
         duration = excluded.duration,
         width = excluded.width,
         height = excluded.height,
         size_bytes = excluded.size_bytes,
         file_mtime = excluded.file_mtime,
         cover = excluded.cover,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         scanned_at = excluded.scanned_at,
         search_key = excluded.search_key`,
    );
    const transaction = db.transaction((batch: ScannerPiece[]) => {
      for (const piece of batch) {
        upsert.run({
          path: piece.relativePath,
          category: piece.category,
          channel: piece.channel,
          kind: piece.kind,
          title: piece.title,
          extension: piece.extension,
          duration: piece.duration,
          width: piece.width,
          height: piece.height,
          sizeBytes: piece.sizeBytes,
          fileMtime: piece.fileMtime,
          cover: piece.cover,
          createdAt: piece.createdAt,
          addedAt: piece.addedAt,
          updatedAt: nowIso(),
          scannedAt: piece.scannedAt,
          searchKey: normalizeSearchKey(piece.title),
        });
      }
    });
    for (let index = 0; index < pieces.length; index += WRITE_BATCH) {
      transaction(pieces.slice(index, index + WRITE_BATCH));
    }
  }

  function deleteMissing(pathsToDelete: string[]): number {
    if (pathsToDelete.length === 0) return 0;
    const remove = db.prepare('DELETE FROM media_items WHERE path = ?');
    const transaction = db.transaction((paths: string[]) => {
      for (const path of paths) remove.run(path);
    });
    transaction(pathsToDelete);
    return pathsToDelete.length;
  }

  async function run(): Promise<void> {
    const startedAtIso = nowIso();
    status.running = true;
    status.processed = 0;
    status.total = 0;
    status.currentFile = '';
    status.message = 'Iniciando escaneo de la biblioteca';
    status.startedAt = startedAtIso;
    status.finishedAt = null;
    status.error = null;
    status.added = 0;
    status.updated = 0;
    status.removed = 0;

    const runId = startScanRun(db, startedAtIso);
    const context: CoverContext = {
      coversDir: deps.coversDir,
      mediaDir: deps.mediaDir,
      ffmpeg: deps.ffmpeg,
      ffprobe: deps.ffprobe,
      logger,
    };
    const files: ScannedFile[] = [];
    let caught: unknown = null;

    try {
      logger.info({ mediaDir: deps.mediaDir, concurrency: deps.concurrency }, 'Escaneo iniciado');
      await walk(deps.mediaDir, DEFAULT_CATEGORY, DEFAULT_CHANNEL, files);
      if (cancelled) {
        status.message = 'Escaneo cancelado';
        return;
      }
      const existing = existingItems();
      const present = new Set(files.map((file) => file.relativePath));
      const missing = [...existing.keys()].filter((path) => !present.has(path));
      const pending = files.filter((file) => !isUnchanged(file, existing.get(file.relativePath)));
      status.total = pending.length;

      const queue = [...pending];
      const workers = Array.from({ length: Math.max(1, deps.concurrency) }, async () => {
        while (!cancelled) {
          const file = queue.shift();
          if (!file) return;
          status.currentFile = file.relativePath;
          status.message = `Procesando ${file.relativePath}`;
          const previous = existing.get(file.relativePath);
          try {
            const piece = await processFile(file, previous, context);
            if (cancelled) return;
            writePieces([piece]);
            if (previous) status.updated += 1;
            else status.added += 1;
          } catch (error) {
            logger.warn(
              { relativePath: file.relativePath, error: error instanceof Error ? error.message : String(error) },
              'Fichero omitido por error al procesarlo',
            );
          }
          status.processed += 1;
        }
      });
      await Promise.all(workers);

      if (cancelled) {
        status.message = 'Escaneo cancelado';
        return;
      }

      status.removed = deleteMissing(missing);
      status.currentFile = '';
      status.total = files.length;
      status.message = `Escaneo completado: ${files.length} archivos en la biblioteca (${status.added} nuevos, ${status.updated} actualizados, ${status.removed} eliminados)`;
      logger.info({ total: files.length, added: status.added, updated: status.updated, removed: status.removed }, 'Escaneo completado');
    } catch (error) {
      caught = error;
      status.error = error instanceof Error ? error.message : 'Error al escanear la biblioteca';
      status.message = status.error;
      logger.error({ error: status.error }, 'Escaneo fallido');
    } finally {
      finishScanRun(
        db,
        runId,
        { total: files.length, added: status.added, updated: status.updated, removed: status.removed, error: status.error },
        nowIso(),
      );
      status.running = false;
      status.finishedAt = nowIso();
      status.currentFile = '';
      if (!cancelled && caught === null && status.error === null && status.message.startsWith('Procesando')) {
        status.message = `Escaneo completado: ${files.length} archivos`;
      }
      running = null;
    }
  }

  return {
    status: () => ({ ...status }),
    isRunning: () => status.running,
    start: () => {
      if (running) return { accepted: false, startedAt: status.startedAt ?? nowIso(), reason: 'Ya hay un escaneo en curso' };
      cancelled = false;
      const startedAt = nowIso();
      running = run();
      // `run()` ya ha fijado el estado inicial de forma síncrona.
      return { accepted: true, startedAt: status.startedAt ?? startedAt };
    },
    cancel: () => {
      if (!running) return false;
      cancelled = true;
      status.message = 'Cancelando escaneo…';
      return true;
    },
    waitForIdle: async () => {
      if (running) await running.catch(() => undefined);
    },
  };
}
