import { type ReactNode, useState } from 'react';
import { IconFilm, IconMusic } from '../lib/icons.js';
import type { MediaKind } from '../lib/types.js';
import { ProgressBar } from './ProgressBar.js';

type ArtworkProps = {
  kind: MediaKind;
  src: string | null;
  className?: string;
  /** Progreso 0..1: se pinta como barra pegada al borde inferior. */
  progress?: number;
  /** Carga prioritaria (primeras tarjetas visibles). */
  eager?: boolean;
  children?: ReactNode;
};

/**
 * Carátula. El arte es decorativo (`alt=""`) porque el título siempre está al
 * lado; el nombre accesible lo aporta la tarjeta.
 */
export function Artwork({ kind, src, className, progress = 0, eager = false, children }: ArtworkProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showImage = Boolean(src) && !failed;

  const classes = ['artwork', className].filter(Boolean).join(' ');

  return (
    <div className={classes} data-kind={kind} data-loaded={loaded}>
      {showImage && kind === 'audio' && <span className="artwork-audio-bg" style={{ backgroundImage: `url(${src})` }} aria-hidden="true" />}
      {showImage && (
        <img
          src={src as string}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      {!showImage && (
        <span className="artwork-fallback" aria-hidden="true">
          {kind === 'video' ? <IconFilm /> : <IconMusic />}
        </span>
      )}
      {progress > 0 && <ProgressBar value={progress} label="Progreso de este archivo" />}
      {children}
    </div>
  );
}
