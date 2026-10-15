import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../data/PlayerProvider.js';
import { formatClock } from '../lib/format.js';
import { IconClose, IconPause, IconPlay, IconSkipNext, IconSkipPrev } from '../lib/icons.js';
import { Artwork } from './Artwork.js';
import { useToast } from './Toast.js';

/**
 * Barra del mini reproductor. Vive **dentro** del armazón, en su propia fila de
 * la rejilla, para que no tape la galería: cuando flotaba encima, un toque sobre
 * una tarjeta que quedara debajo lo recibía la barra (y abría el vídeo anterior
 * en lugar del elegido).
 *
 * No importa nada del reproductor de vídeo, así que no arrastra la librería al
 * paquete de entrada.
 */
export function MiniPlayer() {
  const { current, playing, position, duration, toggle, next, previous, stop, hasNext } = usePlayer();
  const navigate = useNavigate();
  const { notify } = useToast();

  if (!current) return null;

  const open = () => navigate(`/ver/${current.id}`);
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <div className="miniplayer">
      <button type="button" className="miniplayer-open" onClick={open} aria-label={`Abrir el reproductor: ${current.title}`}>
        <Artwork kind={current.kind} src={current.artworkUrl} eager />
      </button>

      <button type="button" className="miniplayer-info" onClick={open}>
        <span className="t">{current.title}</span>
        <span className="s">
          {playing ? 'Sonando' : 'En pausa'}
          {duration > 0 ? ` · ${formatClock(position) || '0:00'} / ${formatClock(duration)}` : ` · ${current.channel}`}
        </span>
      </button>

      <div className="miniplayer-actions">
        <button type="button" className="icon-btn" onClick={previous} aria-label="Anterior">
          <IconSkipPrev />
        </button>
        <button type="button" className="icon-btn" onClick={toggle} aria-label={playing ? 'Pausar' : 'Reproducir'}>
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <button type="button" className="icon-btn" onClick={next} disabled={!hasNext} aria-label="Siguiente">
          <IconSkipNext />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            stop();
            notify('Reproducción detenida');
          }}
          aria-label="Detener la reproducción"
        >
          <IconClose />
        </button>
      </div>

      <span className="miniplayer-progress" aria-hidden="true">
        <span style={{ display: 'block', height: '100%', width: `${progress * 100}%`, background: 'var(--accent)' }} />
      </span>
    </div>
  );
}
