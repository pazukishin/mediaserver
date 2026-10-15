import { Link } from 'react-router-dom';
import { formatClock, formatDuration, formatRemaining } from '../lib/format.js';
import { IconCheck, IconHeart, IconPause, IconPlay } from '../lib/icons.js';
import type { Item } from '../lib/types.js';
import { Artwork } from './Artwork.js';

type MediaCardProps = {
  item: Item;
  /** Ruta a la que lleva la tarjeta (reproductor o ficha del canal). */
  to: string;
  size?: 'compact' | 'cozy' | 'roomy';
  eager?: boolean;
  /** Si se pasa, aparece el corazón sobre la carátula. */
  onFavorite?: (item: Item, favorite: boolean) => void;
  /** Marca visualmente el elemento que está sonando. */
  playing?: boolean;
  paused?: boolean;
};

function metaLine(item: Item): { text: string; remaining: string } {
  const inProgress = item.progress > 0.01 && item.progress < 0.95 && !item.watched;
  if (inProgress) return { text: item.channel, remaining: formatRemaining(item.position, item.duration) };
  const duration = formatClock(item.duration);
  return { text: duration ? `${item.channel} · ${duration}` : item.channel, remaining: '' };
}

/**
 * Tarjeta de contenido. El enlace estirado (`.card-stretch`) hace que toda la
 * tarjeta sea pulsable y navegable con teclado sin anidar interactivos.
 */
export function MediaCard({ item, to, eager = false, onFavorite, playing = false, paused = false }: MediaCardProps) {
  const { text, remaining } = metaLine(item);
  const progress = item.watched ? 0 : item.progress;

  return (
    <article className="card" data-playing={playing || undefined}>
      <div className="card-media">
        <Artwork kind={item.kind} src={item.artworkUrl} progress={progress} eager={eager}>
          <span className="card-play" aria-hidden="true">
            {playing && !paused ? <IconPause /> : <IconPlay />}
          </span>
        </Artwork>
        {onFavorite && (
          <button
            type="button"
            className="card-fav"
            aria-pressed={item.favorite}
            aria-label={item.favorite ? `Quitar ${item.title} de favoritos` : `Añadir ${item.title} a favoritos`}
            onClick={() => onFavorite(item, !item.favorite)}
          >
            <IconHeart filled={item.favorite} />
          </button>
        )}
      </div>

      <div className="card-body">
        <h3 className="card-title clamp-2">
          <Link className="card-stretch" to={to}>
            {item.title}
          </Link>
        </h3>
        <p className="card-meta">
          <span className="clamp-1">{text}</span>
          {remaining && <span className="clamp-1">{remaining}</span>}
          {item.watched && (
            <span className="card-seen">
              <IconCheck />
              <span className="sr-only">Visto</span>
            </span>
          )}
        </p>
      </div>
    </article>
  );
}

/** Tarjeta ancha para el carrusel de "Seguir viendo". */
export function ContinueCard({ item, to, onFavorite }: { item: Item; to: string; onFavorite?: (item: Item, favorite: boolean) => void }) {
  return (
    <article className="card">
      <div className="card-media">
        <Artwork kind={item.kind} src={item.artworkUrl} progress={item.progress} eager />
        {onFavorite && (
          <button
            type="button"
            className="card-fav"
            aria-pressed={item.favorite}
            aria-label={item.favorite ? `Quitar ${item.title} de favoritos` : `Añadir ${item.title} a favoritos`}
            onClick={() => onFavorite(item, !item.favorite)}
          >
            <IconHeart filled={item.favorite} />
          </button>
        )}
        <span className="card-play" aria-hidden="true">
          <IconPlay />
        </span>
      </div>
      <div className="card-body">
        <h3 className="card-title clamp-2">
          <Link className="card-stretch" to={to}>
            {item.title}
          </Link>
        </h3>
        <p className="card-meta">
          <span className="clamp-1">{item.channel}</span>
          <span className="clamp-1">{formatRemaining(item.position, item.duration) || formatDuration(item.duration)}</span>
        </p>
      </div>
    </article>
  );
}
