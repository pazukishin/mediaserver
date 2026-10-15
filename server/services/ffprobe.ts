import { spawnSync } from 'node:child_process';
import { runCommand } from './ffmpeg-runner.js';

export type MediaMetadata = {
  duration: number;
  width: number | null;
  height: number | null;
};

export type FfTools = {
  ffmpeg: boolean;
  ffprobe: boolean;
};

const PROBE_TIMEOUT_MS = 15_000;

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/** Disponibilidad de los binarios; se consulta una sola vez al arrancar. */
export function detectFfTools(): FfTools {
  return { ffmpeg: commandExists('ffmpeg'), ffprobe: commandExists('ffprobe') };
}

function commandExists(command: string): boolean {
  try {
    const result = spawnSync(command, ['-version'], { stdio: 'ignore', timeout: 10_000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Metadatos reales con ffprobe. Si falla o no está disponible devuelve duración
 * 0 (nunca lanza: el escaneo debe continuar con el resto de ficheros).
 */
export async function probeMedia(filePath: string, ffprobeAvailable = true): Promise<MediaMetadata> {
  if (!ffprobeAvailable) return { duration: 0, width: null, height: null };
  try {
    const { stdout } = await runCommand('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath], {
      timeoutMs: PROBE_TIMEOUT_MS,
      capture: true,
    });
    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string | number };
      streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string | number }>;
    };
    const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
    const duration = toNumber(parsed.format?.duration) || toNumber(video?.duration);
    return {
      duration,
      width: video?.width === undefined ? null : toNumber(video.width),
      height: video?.height === undefined ? null : toNumber(video.height),
    };
  } catch {
    return { duration: 0, width: null, height: null };
  }
}
