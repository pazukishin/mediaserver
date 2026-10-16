import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AppConfig } from '../../server/config.js';

export function hasBinary(command: string): boolean {
  try {
    return spawnSync(command, ['-version'], { stdio: 'ignore', timeout: 15_000 }).status === 0;
  } catch {
    return false;
  }
}

export function createTempDir(prefix = 'mediaserver-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Configuración aislada: nunca toca `media/`, `data/` ni `dist/` reales. */
export function createTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const root = createTempDir();
  const dataDir = join(root, 'data');
  const mediaDir = join(root, 'media');
  const coversDir = join(dataDir, 'covers');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(mediaDir, { recursive: true });
  mkdirSync(coversDir, { recursive: true });
  return {
    port: 0,
    host: '127.0.0.1',
    mediaDir,
    dataDir,
    coversDir,
    dbPath: join(dataDir, 'mediaserver.db'),
    // No existe a propósito: sin build, el servidor sólo atiende la API. Así los
    // tests no dependen de que alguien haya ejecutado `pnpm build` antes.
    staticDir: join(root, 'dist'),
    mediaUser: 'media',
    mediaPassword: 'contrasena-de-prueba',
    sessionSecret: 'secreto-de-prueba-con-mas-de-32-caracteres-ok',
    trustProxy: false,
    scanConcurrency: 1,
    logLevel: 'silent',
    tlsCert: null,
    tlsKey: null,
    tlsPort: 3443,
    ...overrides,
  };
}

export function writeFixtureFile(directory: string, relativePath: string, contents = ''): string {
  const fullPath = join(directory, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, contents);
  return fullPath;
}

/** Imagen diminuta real (JPEG), útil como carátula de carpeta. */
export function makeTestImage(filePath: string): boolean {
  mkdirSync(dirname(filePath), { recursive: true });
  const result = spawnSync(
    'ffmpeg',
    ['-y', '-f', 'lavfi', '-i', 'color=c=purple:size=80x80:duration=0.1', '-frames:v', '1', '-c:v', 'mjpeg', '-q:v', '5', filePath],
    { stdio: 'ignore', timeout: 60_000 },
  );
  return result.status === 0;
}

/** Vídeo diminuto real (0,5 s) con pista de vídeo y de audio. */
export function makeTestVideo(filePath: string): boolean {
  mkdirSync(dirname(filePath), { recursive: true });
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=160x120:rate=10:duration=0.5',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=0.5',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      filePath,
    ],
    { stdio: 'ignore', timeout: 60_000 },
  );
  return result.status === 0;
}

/** Audio diminuto real (0,5 s). */
export function makeTestAudio(filePath: string): boolean {
  mkdirSync(dirname(filePath), { recursive: true });
  const result = spawnSync(
    'ffmpeg',
    ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', '-c:a', 'libmp3lame', '-q:a', '9', filePath],
    { stdio: 'ignore', timeout: 60_000 },
  );
  return result.status === 0;
}
