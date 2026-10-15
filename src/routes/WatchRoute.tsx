import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorState } from '../components/States.js';
import { buildQueueFor, usePlayer } from '../data/PlayerProvider.js';
import { api } from '../lib/api.js';

/**
 * Ruta del reproductor. El reproductor en sí vive en `PlayerDock` (montado en la
 * raíz), así que aquí sólo se resuelve qué elemento debe sonar: al abrir un
 * enlace directo se carga el archivo y su cola.
 *
 * La URL es la única fuente de verdad: este efecto sólo reacciona a cambios del
 * parámetro `:id`. Avanzar de pista (siguiente/anterior/autoplay) ya navega por
 * su cuenta (en `PlayerProvider.goToItem`), así que aquí no hay un segundo
 * efecto que «sincronice» la URL: ese segundo efecto producía carreras (la URL
 * rebotaba al elemento anterior mientras se cargaba el nuevo).
 */
export function WatchRoute() {
  const { id = '' } = useParams();
  const numericId = Number(id);
  const { current, play } = usePlayer();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  // Referencias para que el efecto no dependa de identidades que cambian: si
  // `play` o `current` estuvieran en las dependencias, cualquier re-render en
  // mitad de la carga cancelaría la petición y la pista se quedaría en la
  // anterior.
  const playRef = useRef(play);
  playRef.current = play;
  const currentIdRef = useRef(current?.id);
  currentIdRef.current = current?.id;

  useEffect(() => {
    if (!Number.isInteger(numericId) || numericId <= 0) {
      setError('Ese identificador no corresponde a ningún archivo.');
      return;
    }

    let cancelled = false;
    setError(null);
    (async () => {
      // Si ya suena este mismo elemento (p. ej. la cola avanzó hasta él y la URL
      // le siguió), no se recarga: así la reproducción no se corta.
      if (currentIdRef.current === numericId) return;
      const item = await api.item(numericId);
      const queue = await buildQueueFor(item);
      if (cancelled) return;
      playRef.current(item, queue);
    })().catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'No se pudo abrir el archivo');
    });

    return () => {
      cancelled = true;
    };
  }, [numericId]);

  if (error) return <ErrorState message={error} onRetry={() => navigate('/')} />;

  return (
    <div className="state">
      <strong>Abriendo el reproductor…</strong>
      <p>Preparando el archivo y su cola de reproducción.</p>
    </div>
  );
}
