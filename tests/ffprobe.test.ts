import { beforeAll, describe, expect, it } from 'vitest';
import { detectFfTools, probeMedia } from '../server/services/ffprobe.js';
import { createTempDir, makeTestAudio, makeTestVideo } from './helpers/fixtures.js';

let videoPath = '';
let audioPath = '';

beforeAll(() => {
  const directory = createTempDir('probe-');
  videoPath = `${directory}/probe.mp4`;
  audioPath = `${directory}/probe.mp3`;
  makeTestVideo(videoPath);
  makeTestAudio(audioPath);
});

describe('probeMedia', () => {
  it('lee la duración real de un vídeo', async () => {
    if (!videoPath) return;
    const metadata = await probeMedia(videoPath);
    expect(metadata.duration).toBeGreaterThan(0.1);
    expect(metadata.duration).toBeLessThan(3);
    expect(metadata.width).toBe(160);
    expect(metadata.height).toBe(120);
  });

  it('lee la duración real de un audio', async () => {
    const metadata = await probeMedia(audioPath);
    expect(metadata.duration).toBeGreaterThan(0.1);
    expect(metadata.duration).toBeLessThan(3);
    expect(metadata.width).toBeNull();
  });

  it('devuelve duración 0 sin lanzar si el fichero no es multimedia', async () => {
    const directory = createTempDir('probe-bad-');
    const broken = `${directory}/roto.mp3`;
    await expect(probeMedia(broken)).resolves.toEqual({ duration: 0, width: null, height: null });
  });

  it('devuelve duración 0 si ffprobe no está disponible', async () => {
    await expect(probeMedia(audioPath, false)).resolves.toEqual({ duration: 0, width: null, height: null });
  });
});

describe('detectFfTools', () => {
  it('detecta ffmpeg y ffprobe en esta máquina', () => {
    const tools = detectFfTools();
    expect(typeof tools.ffmpeg).toBe('boolean');
    expect(typeof tools.ffprobe).toBe('boolean');
    expect(tools.ffprobe).toBe(true);
  });
});
