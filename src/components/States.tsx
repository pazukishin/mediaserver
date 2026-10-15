import type { ReactNode } from 'react';

type StateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
};

/** Estado vacío con salida: nunca un callejón sin acción. */
export function EmptyState({ icon, title, description, action }: StateProps) {
  return (
    <div className="state">
      {icon}
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

/** Estado de error con reintento explícito. */
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="state">
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <path d="M12 3.5 21 19.5H3L12 3.5Z" strokeLinejoin="round" />
        <path d="M12 9.5v4M12 17h.01" strokeLinecap="round" />
      </svg>
      <strong>No se pudo cargar</strong>
      <p>{message}</p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}

/** Esqueleto con la forma real del contenido: evita la pantalla en blanco. */
export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}

export function SkeletonGrid({ count = 12, size = 'cozy' }: { count?: number; size?: 'compact' | 'cozy' | 'roomy' }) {
  // Claves estables: son elementos decorativos, pero regenerar la lista en cada
  // render no debe reiniciar la animación de brillo.
  const placeholders = Array.from({ length: count }, (_, index) => `skeleton-${index}`);
  return (
    <div className="grid" data-size={size} aria-hidden="true">
      {placeholders.map((key) => (
        <SkeletonCard key={key} />
      ))}
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="state" aria-hidden="true">
      <div className="skeleton" style={{ width: 120, height: 14 }} />
    </div>
  );
}
