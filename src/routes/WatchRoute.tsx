import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorState } from '../components/States.js';
import { buildQueueFor, usePlayer } from '../data/PlayerProvider.js';
import { api } from '../lib/api.js';

/**
 * Ruta del reproductor. El reproductor en sí vive en `PlayerDock` (montado en la
 * raíz), así que aquí sólo se resuelve qué elemento debe sonar: al abrir un
 * enlace directo se carga el archivo y su cola.
 */
export function WatchRoute() {
  const { id = '' } = useParams();
  const numericId = Number(id);
  const { current, play } = usePlayer();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!Number.isInteger(numericId) || numericId <= 0) {
      setError('Ese identificador no corresponde a ningún archivo.');
      return;
    }
    if (handled.current.has(numericId)) return;
    if (current?.id === numericId) {
      handled.current.add(numericId);
      return;
    }

    let cancelled = false;
    setError(null);
    (async () => {
      const item = await api.item(numericId);
      const queue = await buildQueueFor(item);
      if (cancelled) return;
      handled.current.add(numericId);
      play(item, queue);
    })().catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'No se pudo abrir el archivo');
    });

    return () => {
      cancelled = true;
    };
  }, [numericId, current?.id, play]);

  // Mantiene la URL sincronizada cuando la cola avanza sola (autoplay).
  useEffect(() => {
    if (!current) return;
    if (handled.current.has(numericId) && current.id !== numericId) {
      navigate(`/ver/${current.id}`, { replace: true });
    }
  }, [current, numericId, navigate]);

  if (error) return <ErrorState message={error} onRetry={() => navigate('/')} />;

  return (
    <div className="state">
      <strong>Abriendo el reproductor…</strong>
      <p>Preparando el archivo y su cola de reproducción.</p>
    </div>
  );
}
