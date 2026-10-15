import { MediaPlayer, MediaProvider, type PlayerSrc } from '@vidstack/react';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import { useState } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import { useLibrary } from '../data/LibraryProvider.js';
import { usePlayer } from '../data/PlayerProvider.js';
import { usePreferences } from '../data/Preferences.js';
import { formatClock } from '../lib/format.js';
import { IconCheck, IconClose, IconHeart, IconList, IconMusic, IconPause, IconPlay, IconSkipNext, IconSkipPrev } from '../lib/icons.js';
import { isProbablyPlayable, mediaSource } from '../lib/media.js';
import type { Item } from '../lib/types.js';
import { Artwork } from './Artwork.js';
import { Sheet } from './Sheet.js';

/**
 * Reproductor persistente. El elemento `<MediaPlayer>` vive siempre en el mismo
 * punto del árbol y sólo cambia de presentación por CSS: en modo `mini` queda
 * fuera de la vista (1px, recortado) pero **sigue sonando**, y en modo `full`
 * ocupa la pantalla. Desmontarlo al navegar cortaría la reproducción, que es
 * justo lo que hacía la versión anterior.
 */
export function PlayerDock() {
  const { current, queue, index, position, duration, playQueue, playerRef, next } = usePlayer();
  const { autoplay, setAutoplay } = usePreferences();
  const { setFavorite, setWatched } = useLibrary();
  const navigate = useNavigate();
  const location = useLocation();
  const routeMatch = useMatch('/ver/:id');
  const [queueOpen, setQueueOpen] = useState(false);

  if (!current) return null;

  const mode = routeMatch ? 'full' : 'mini';
  const source = mediaSource(current);
  const playable = isProbablyPlayable(current);
  const closeFullPlayer = () => {
    if (location.key === 'default') navigate('/');
    else navigate(-1);
  };
  // El avance automático se dispara desde el reproductor (`onEnded`), no desde
  // un listener en el elemento: Vidstack no reenvía `ended` como evento DOM al
  // elemento del reproductor, así que el listener que había no se disparaba.
  const handleEnded = () => {
    if (autoplay) next();
  };

  return (
    <>
      <div className="player-dock" data-mode={mode} data-kind={current.kind} aria-hidden={mode === 'mini' ? true : undefined}>
        <div className="dock-stage">
          {current.kind === 'audio' && (
            <div className="player-audio-art">
              {current.artworkUrl && (
                <span className="artwork-audio-bg" style={{ backgroundImage: `url(${current.artworkUrl})` }} aria-hidden="true" />
              )}
              {current.artworkUrl ? <img src={current.artworkUrl} alt="" /> : <IconMusic size={64} />}
            </div>
          )}

          {playable ? (
            <MediaPlayer
              ref={playerRef}
              className="player-media"
              title={current.title}
              // El `.d.ts` de Vidstack se queda corto: en ejecución reconoce
              // `audio/mp4` (y `audio/m4a`, `audio/mp4a`), pero su unión pública
              // no los declara. Se usa el tipo real del archivo —que es lo que
              // el reproductor comprueba— y el ajuste de tipos se hace aquí.
              src={source as unknown as PlayerSrc}
              viewType={current.kind}
              poster={current.kind === 'video' ? (current.artworkUrl ?? undefined) : undefined}
              playsInline
              streamType="on-demand"
              onEnded={handleEnded}
            >
              <MediaProvider />
              {current.kind === 'video' ? <DefaultVideoLayout icons={defaultLayoutIcons} /> : <AudioControls />}
            </MediaPlayer>
          ) : (
            <div className="state" style={{ border: 0, maxWidth: 420 }}>
              <strong>Este formato no se reproduce en el navegador</strong>
              <p>
                El archivo es <code>{current.extension}</code>, que el navegador no sabe decodificar. Puedes descargarlo y verlo con un
                reproductor local.
              </p>
              <a className="btn btn-primary" href={current.streamUrl} download>
                Descargar el archivo
              </a>
            </div>
          )}
        </div>

        {mode === 'full' && (
          <>
            <div className="dock-bar">
              <div className="player-bar-top">
                <div className="player-titles">
                  <h1 className="clamp-2">{current.title}</h1>
                  <p className="sub clamp-1">
                    {current.channel}
                    {duration > 0 ? ` · ${formatClock(position) || '0:00'} / ${formatClock(duration)}` : ''}
                  </p>
                </div>
                <div className="player-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-pressed={current.favorite}
                    aria-label={current.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                    onClick={() => setFavorite(current, !current.favorite)}
                  >
                    <IconHeart filled={current.favorite} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-pressed={current.watched}
                    aria-label={current.watched ? 'Marcar como no visto' : 'Marcar como visto'}
                    onClick={() => setWatched(current, !current.watched)}
                  >
                    <IconCheck />
                  </button>
                  {queue.length > 1 && (
                    <button
                      type="button"
                      className="icon-btn dock-queue-button"
                      aria-label="Ver la cola"
                      onClick={() => setQueueOpen(true)}
                    >
                      <IconList />
                    </button>
                  )}
                  {/* Cerrar, al final y a la derecha. Vive en la barra y no
                      flotando sobre el vídeo: los controles de la librería van
                      en z-index 50 y tapaban el botón, así que el clic dependía
                      de si estaban visibles. */}
                  <button type="button" className="icon-btn player-close" onClick={closeFullPlayer} aria-label="Cerrar el reproductor">
                    <IconClose />
                  </button>
                </div>
              </div>
              <label className="switch" style={{ minHeight: 0 }}>
                <span className="switch-label">
                  <span>Reproducción automática</span>
                  <small>Al terminar, pasa al siguiente archivo del canal</small>
                </span>
                <input type="checkbox" checked={autoplay} onChange={(event) => setAutoplay(event.target.checked)} />
              </label>
            </div>

            {queue.length > 1 && (
              <aside className="dock-queue" aria-label="Cola de reproducción">
                <h2 style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)' }}>
                  A continuación · {Math.max(0, queue.length - index - 1)}
                </h2>
                <div className="queue-list">
                  {queue.map((entry, entryIndex) => (
                    <QueueRow
                      key={entry.id}
                      item={entry}
                      active={entryIndex === index}
                      onPlay={() => {
                        playQueue(queue, entryIndex);
                        setQueueOpen(false);
                      }}
                    />
                  ))}
                </div>
              </aside>
            )}
          </>
        )}
      </div>

      <Sheet open={queueOpen} title="Cola de reproducción" onClose={() => setQueueOpen(false)}>
        <div className="queue-list">
          {queue.map((entry, entryIndex) => (
            <QueueRow
              key={entry.id}
              item={entry}
              active={entryIndex === index}
              onPlay={() => {
                playQueue(queue, entryIndex);
                setQueueOpen(false);
              }}
            />
          ))}
        </div>
      </Sheet>
    </>
  );
}

/**
 * Controles propios para audio. La barra que trae la librería de vídeo está
 * pensada para contenedores anchos y en un móvil se apelotona (título cortado,
 * etiquetas sueltas). Aquí el título ya se ve debajo, así que la barra se queda
 * con lo útil: retroceder, reproducir, avanzar, posición y duración.
 */
function AudioControls() {
  const { playing, position, duration, toggle, seekTo } = usePlayer();
  const max = duration > 0 ? duration : 1;

  return (
    <div className="audio-controls">
      <button type="button" className="icon-btn" onClick={() => seekTo(Math.max(0, position - 10))} aria-label="Retroceder 10 segundos">
        <IconSkipPrev />
      </button>
      <button type="button" className="audio-play" onClick={toggle} aria-label={playing ? 'Pausar' : 'Reproducir'}>
        {playing ? <IconPause /> : <IconPlay />}
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => seekTo(Math.min(duration, position + 10))}
        aria-label="Avanzar 10 segundos"
        disabled={duration === 0}
      >
        <IconSkipNext />
      </button>

      <span className="audio-time">{formatClock(position) || '0:00'}</span>
      <input
        className="audio-seek"
        type="range"
        min={0}
        max={max}
        step={1}
        value={Math.min(position, max)}
        aria-label="Posición de reproducción"
        aria-valuetext={`${formatClock(position) || '0:00'} de ${formatClock(duration) || '0:00'}`}
        disabled={duration === 0}
        onChange={(event) => seekTo(Number(event.target.value))}
      />
      <span className="audio-time">{formatClock(duration) || '0:00'}</span>
    </div>
  );
}

function QueueRow({ item, active, onPlay }: { item: Item; active: boolean; onPlay: () => void }) {
  return (
    <button type="button" className="queue-item" aria-current={active} onClick={onPlay}>
      <Artwork kind={item.kind} src={item.artworkUrl} />
      <span className="t">{item.title}</span>
      <span className="d">{item.duration > 0 ? formatClock(item.duration) : ''}</span>
    </button>
  );
}
