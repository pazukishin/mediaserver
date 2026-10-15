import type { Item } from './types.js';

/**
 * Tipos que el reproductor reconoce.
 *
 * La lista es **cerrada** y no es decorativa: el reproductor la usa como
 * interruptor para decidir si la fuente es audio o vídeo y qué proveedor montar.
 * El MIME real del archivo lo envía el servidor en el `Content-Type`; esto sólo
 * es la pista.
 *
 * Ojo con `audio/object` y `video/object`: parecen la opción honesta para los
 * contenedores que no están en la lista, y son justo lo contrario. Sólo valen
 * para URLs `blob:`, así que con una URL normal (`/api/stream/59`) el
 * reproductor concluye que la fuente no es audio, **no monta ningún elemento de
 * medios** y al pulsar reproducir salta «media not ready». Por eso los formatos
 * que no están en la lista usan el tipo reconocido más cercano.
 */
export type AudioPlayerMime = 'audio/mpeg' | 'audio/ogg' | 'audio/flac' | 'audio/mp4';
export type VideoPlayerMime = 'video/mp4' | 'video/webm' | 'video/avi';
export type PlayerMime = AudioPlayerMime | VideoPlayerMime;

/** Todo lo que aparece en los mapas de abajo tiene que estar aquí. */
export const RECOGNISED_PLAYER_TYPES: readonly PlayerMime[] = [
  'audio/mpeg',
  'audio/ogg',
  'audio/flac',
  'audio/mp4',
  'video/mp4',
  'video/webm',
  'video/avi',
];

/**
 * Fuente para el reproductor. El tipo va separado por audio y vídeo, así que un
 * MIME de audio en una fuente de vídeo no compila.
 */
export type MediaSource = { src: string; type: AudioPlayerMime } | { src: string; type: VideoPlayerMime };

const AUDIO_TYPES: Record<string, AudioPlayerMime> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  // AAC en contenedor MP4: es el tipo real que envía el servidor.
  '.m4a': 'audio/mp4',
  // AAC crudo (ADTS) y WAV no están en la lista del reproductor. El navegador
  // sigue usando el `Content-Type` del servidor; esto sólo le dice al
  // reproductor que es audio y que monte el proveedor del navegador.
  '.aac': 'audio/mp4',
  '.wav': 'audio/mpeg',
};

const VIDEO_TYPES: Record<string, VideoPlayerMime> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/mp4',
  '.webm': 'video/webm',
  '.avi': 'video/avi',
  // Matroska no está en la lista; además `isProbablyPlayable` ya lo descarta, así
  // que aquí sólo hace falta no dejar un tipo que rompa el reproductor.
  '.mkv': 'video/mp4',
};

/** Fuente reproducible para el reproductor. */
export function mediaSource(item: Item): MediaSource {
  const extension = item.extension.toLowerCase();
  if (item.kind === 'video') return { src: item.streamUrl, type: VIDEO_TYPES[extension] ?? 'video/mp4' };
  return { src: item.streamUrl, type: AUDIO_TYPES[extension] ?? 'audio/mpeg' };
}

/** Formatos que un navegador de escritorio reproduce de forma fiable. */
const PLAYABLE_VIDEO = new Set(['.mp4', '.webm', '.mov']);

export function isProbablyPlayable(item: Item): boolean {
  if (item.kind === 'audio') return true;
  return PLAYABLE_VIDEO.has(item.extension.toLowerCase());
}
