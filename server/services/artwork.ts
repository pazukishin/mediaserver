import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, resolve, sep } from 'node:path';
import { IMAGE_EXTENSIONS } from '../repositories/types.js';
import { sha256 } from '../security.js';
import { runCommand } from './ffmpeg-runner.js';
import { probeMedia } from './ffprobe.js';

export type ArtworkLogger = {
  info: (data: object, message: string) => void;
  warn: (data: object, message: string) => void;
};

export type CoverContext = {
  coversDir: string;
  mediaDir: string;
  ffmpeg: boolean;
  ffprobe: boolean;
  logger: ArtworkLogger;
};

/** Nombres de imagen que se aceptan como carátula de un disco o carpeta. */
export const FOLDER_IMAGE_NAMES = ['cover', 'folder', 'front', 'album', 'poster'];
export const COVER_WIDTH = 640;
export const PREVIEW_COUNT = 5;

const FFMPEG_TIMEOUT_MS = 20_000;

/**
 * Instante seguro para extraer un fotograma: al 10 % de la duración (mínimo 1 s)
 * cuando el vídeo es largo y a mitad de camino cuando es muy corto, para no
 * pedir un `-ss` más allá del último fotograma (ffmpeg devuelve 0 bytes).
 */
export function frameTime(duration: number, ratio: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (duration <= 1) return duration * 0.5;
  return Math.min(Math.max(1, duration * ratio), duration - 0.1);
}

export function coverCacheName(relativePath: string): string {
  return `${sha256(relativePath)}.jpg`;
}

export function previewCacheName(relativePath: string, index: number): string {
  return `${sha256(relativePath)}-preview-${index}.jpg`;
}

export function coverFilePath(coversDir: string, relativePath: string): string {
  return join(coversDir, coverCacheName(relativePath));
}

export function previewFilePath(coversDir: string, relativePath: string, index: number): string {
  return join(coversDir, previewCacheName(relativePath, index));
}

/** El fichero existe y está dentro de MEDIA_DIR (nunca se sale del árbol). */
function isInsideMediaDir(mediaDir: string, candidate: string): boolean {
  const root = resolve(mediaDir);
  const target = resolve(candidate);
  return target === root || target.startsWith(root + sep);
}

function existingFile(candidate: string): string | null {
  try {
    return existsSync(candidate) && statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

function firstFolderImage(directory: string): string | null {
  for (const name of FOLDER_IMAGE_NAMES) {
    for (const extension of IMAGE_EXTENSIONS) {
      const found = existingFile(join(directory, `${name}${extension}`));
      if (found) return found;
    }
  }
  return bestFolderImage(directory);
}

/** Palabras que suelen indicar contraportada, libreto o el propio CD. */
const DISCOURAGED_IMAGE_WORDS = ['back', 'rear', 'trasera', 'inlay', 'disc', 'cd', 'dvd', 'booklet', 'libreto', 'spine', 'lomo'];

function plainText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function words(value: string): string[] {
  return plainText(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Última opción cuando no hay `cover.jpg` ni una imagen con el mismo nombre que
 * el archivo: elegir entre las imágenes de la carpeta la que más se parezca al
 * nombre de la carpeta, penalizando las que suenan a contraportada.
 *
 * Hace falta porque muchas bibliotecas reales nombran la portada como el álbum
 * (`pokemon total.jpg`) en vez de `cover.jpg`, y sin esto los audios se quedaban
 * sin carátula aunque la tuvieran al lado.
 */
function bestFolderImage(directory: string): string | null {
  let names: string[];
  try {
    names = readdirSync(directory).filter((name) => IMAGE_EXTENSIONS.includes(extname(name).toLowerCase()));
  } catch {
    return null;
  }
  if (names.length === 0) return null;

  const folderWords = new Set(words(basename(directory)));
  let best: { file: string; score: number } | null = null;

  for (const name of names) {
    const stem = basename(name, extname(name));
    const stemText = plainText(stem);
    const discouraged = DISCOURAGED_IMAGE_WORDS.some((word) => stemText.includes(word));
    const overlap = words(stem).filter((word) => word.length > 2 && folderWords.has(word)).length;
    const score = (discouraged ? -10 : 0) + overlap;
    if (!best || score > best.score) best = { file: join(directory, name), score };
  }

  return best?.file ?? null;
}

function siblingImage(sourcePath: string): string | null {
  const directory = resolve(sourcePath, '..');
  const base = basename(sourcePath, extname(sourcePath));
  for (const extension of IMAGE_EXTENSIONS) {
    const found = existingFile(join(directory, `${base}${extension}`));
    if (found) return found;
  }
  return null;
}

/** Carátula del canal: cualquier imagen `cover|folder|…` en su carpeta. */
export function findChannelImage(mediaDir: string, category: string, channel: string): string | null {
  const directory = join(mediaDir, category, channel);
  if (!isInsideMediaDir(mediaDir, directory)) return null;
  return firstFolderImage(directory);
}

async function runFfmpeg(args: string[], context: CoverContext, label: object): Promise<boolean> {
  try {
    await runCommand('ffmpeg', args, { timeoutMs: FFMPEG_TIMEOUT_MS });
    return true;
  } catch (error) {
    context.logger.warn({ ...label, error: error instanceof Error ? error.message : String(error) }, 'Carátula no generada');
    return false;
  }
}

/**
 * Genera la carátula del elemento. Vídeo: fotograma al 10 % de la duración
 * (mínimo 1 s). Audio: imagen embebida y, si no, la imagen de la carpeta o la
 * hermana con el mismo nombre base. Devuelve el nombre en `covers/` o null.
 */
export async function generateCover(
  sourcePath: string,
  relativePath: string,
  kind: 'audio' | 'video',
  context: CoverContext,
  duration = 0,
): Promise<string | null> {
  const cacheName = coverCacheName(relativePath);
  const output = join(context.coversDir, cacheName);
  if (existingFile(output)) return cacheName;
  if (!context.ffmpeg) return null;
  mkdirSync(context.coversDir, { recursive: true });

  if (kind === 'video') {
    const seek = frameTime(duration, 0.1);
    const ok = await runFfmpeg(
      [
        '-y',
        '-ss',
        seek.toFixed(3),
        '-i',
        sourcePath,
        '-frames:v',
        '1',
        '-vf',
        `scale=${COVER_WIDTH}:-2:flags=lanczos`,
        '-c:v',
        'mjpeg',
        '-q:v',
        '3',
        output,
      ],
      context,
      { relativePath, kind: 'video' },
    );
    if (ok && existingFile(output)) return cacheName;
  }

  // 1) Imagen embebida (para audio y para vídeo sin fotograma válido).
  const embedded = await runFfmpeg(
    [
      '-y',
      '-i',
      sourcePath,
      '-map',
      '0:v:0',
      '-frames:v',
      '1',
      '-vf',
      `scale=${COVER_WIDTH}:-2:flags=lanczos`,
      '-c:v',
      'mjpeg',
      '-q:v',
      '3',
      output,
    ],
    { ...context, logger: { info: () => {}, warn: () => {} } },
    { relativePath, kind: 'embedded' },
  );
  if (embedded && existingFile(output)) return cacheName;

  // 2) Imagen de la carpeta y 3) imagen hermana con el mismo nombre base.
  const local = firstFolderImage(resolve(sourcePath, '..')) ?? siblingImage(sourcePath);
  if (local) {
    const ok = await runFfmpeg(
      ['-y', '-i', local, '-frames:v', '1', '-vf', `scale=${COVER_WIDTH}:-2:flags=lanczos`, '-c:v', 'mjpeg', '-q:v', '3', output],
      context,
      { relativePath, kind: 'image' },
    );
    if (ok && existingFile(output)) return cacheName;
  }

  return null;
}

/** Genera (una sola vez, bajo demanda) los fotogramas de preview de un vídeo. */
export async function ensurePreviews(
  sourcePath: string,
  relativePath: string,
  context: CoverContext,
  duration = 0,
): Promise<Array<string | null>> {
  const names: Array<string | null> = Array.from({ length: PREVIEW_COUNT }, (_, index) => {
    const name = previewCacheName(relativePath, index);
    return existingFile(join(context.coversDir, name)) ? name : null;
  });
  if (!context.ffmpeg || names.every((name) => name !== null)) return names;

  let effectiveDuration = duration;
  if (effectiveDuration <= 0 && context.ffprobe) {
    effectiveDuration = (await probeMedia(sourcePath, context.ffprobe)).duration;
  }
  mkdirSync(context.coversDir, { recursive: true });

  for (let index = 0; index < PREVIEW_COUNT; index += 1) {
    if (names[index]) continue;
    const time = frameTime(effectiveDuration, (index + 1) / (PREVIEW_COUNT + 1));
    const name = previewCacheName(relativePath, index);
    const output = join(context.coversDir, name);
    const ok = await runFfmpeg(
      [
        '-y',
        '-ss',
        time.toFixed(3),
        '-i',
        sourcePath,
        '-frames:v',
        '1',
        '-vf',
        `scale=${COVER_WIDTH}:-2:flags=lanczos`,
        '-c:v',
        'mjpeg',
        '-q:v',
        '3',
        output,
      ],
      context,
      { relativePath, index, time },
    );
    if (ok && existingFile(output)) names[index] = name;
  }
  return names;
}
