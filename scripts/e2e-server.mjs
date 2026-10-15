#!/usr/bin/env node
/**
 * Arranca MediaServer para los tests end-to-end.
 *
 * Genera una biblioteca diminuta y determinista en `.tmp/e2e/media` (nunca toca
 * la biblioteca real del usuario), arranca el servidor sobre una base de datos
 * limpia en `.tmp/e2e/data` y lo deja escuchando en 127.0.0.1:3210.
 *
 * Playwright lo levanta y lo mata automáticamente (webServer).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = join(ROOT, '.tmp/e2e');
const MEDIA = join(TMP, 'media');
const DATA = join(TMP, 'data');
const PORT = Number(process.env.E2E_PORT ?? 3210);

/** Deben coincidir con `tests/e2e/helpers.ts`. */
const CREDENTIALS = { username: 'e2e', password: 'contrasena-de-pruebas' };

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`ffmpeg falló: ${args.join(' ')}`);
  }
}

/** Genera la biblioteca de pruebas sólo si falta. */
function ensureFixtures() {
  const marker = join(MEDIA, '.fixtures-ok');
  if (existsSync(marker)) return;

  rmSync(MEDIA, { recursive: true, force: true });
  for (const folder of ['Videos/Openings', 'Videos/Documentales', 'Audio/Canciones']) {
    mkdirSync(join(MEDIA, folder), { recursive: true });
  }

  const video = (output, seconds, size = '320x180') =>
    ffmpeg([
      '-f',
      'lavfi',
      '-i',
      `testsrc=size=${size}:rate=15:duration=${seconds}`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=440:duration=${seconds}`,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      output,
    ]);

  const cover = (output, color) => ffmpeg(['-f', 'lavfi', '-i', `color=c=${color}:s=640x360`, '-frames:v', '1', output]);

  video(join(MEDIA, 'Videos/Openings/Apertura 01.mp4'), 3);
  video(join(MEDIA, 'Videos/Openings/Apertura 02.mp4'), 3);
  video(join(MEDIA, 'Videos/Openings/Apertura 03.mkv'), 2);
  video(join(MEDIA, 'Videos/Documentales/Naturaleza Salvaje.mp4'), 4);
  cover(join(MEDIA, 'Videos/Openings/cover.jpg'), 'darkgreen');

  // Audio sin carátula embebida: debe caer en la imagen de la carpeta.
  // El nombre lleva tilde a propósito: la búsqueda debe ignorar acentos.
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=2', '-c:a', 'libmp3lame', join(MEDIA, 'Audio/Canciones/Canción Uno.mp3')]);
  cover(join(MEDIA, 'Audio/Canciones/cover.jpg'), 'purple');
  // Audio con carátula embebida: debe preferirla a la de la carpeta.
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=550:duration=2',
    '-i',
    join(MEDIA, 'Audio/Canciones/cover.jpg'),
    '-map',
    '0:a',
    '-map',
    '1:v',
    '-c:v',
    'mjpeg',
    '-disposition:v',
    'attached_pic',
    '-c:a',
    'libmp3lame',
    join(MEDIA, 'Audio/Canciones/Canción Dos.mp3'),
  ]);

  spawnSync('touch', [marker]);
}

if (!existsSync(join(ROOT, 'dist/index.html'))) {
  console.error('Falta dist/. Ejecuta `pnpm build` antes de los tests end-to-end.');
  process.exit(1);
}

ensureFixtures();

if (!process.env.E2E_KEEP) {
  rmSync(DATA, { recursive: true, force: true });
}
mkdirSync(DATA, { recursive: true });

const child = spawn('node', ['--import', 'tsx', 'server/index.ts'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(PORT),
    MEDIA_DIR: MEDIA,
    DATA_DIR: DATA,
    MEDIA_USER: CREDENTIALS.username,
    MEDIA_PASSWORD: CREDENTIALS.password,
    SESSION_SECRET: 'secreto-de-pruebas-suficientemente-largo-1234567890',
    LOG_LEVEL: 'warn',
  },
});

const shutdown = () => {
  child.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
child.on('exit', (code) => process.exit(code ?? 0));
