import type { ScanStatus } from '../lib/types.js';
import { Sheet } from './Sheet.js';

/** Progreso del escaneo con cancelación real (antes se lanzaba y no había vuelta atrás). */
export function ScanSheet({
  open,
  status,
  onClose,
  onCancel,
}: {
  open: boolean;
  status: ScanStatus;
  onClose: () => void;
  onCancel: () => void;
}) {
  const percent = status.total > 0 ? Math.min(100, Math.round((status.processed / status.total) * 100)) : 0;

  return (
    <Sheet
      open={open}
      title={status.running ? 'Escaneando la biblioteca' : status.error ? 'El escaneo ha fallado' : 'Escaneo terminado'}
      onClose={onClose}
      footer={
        status.running ? (
          <button type="button" className="btn btn-danger" onClick={onCancel}>
            Cancelar el escaneo
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Cerrar
          </button>
        )
      }
    >
      <div className="stack" style={{ gap: 'var(--s-3)' }}>
        <div className="scan-row">
          <div
            className="scan-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="Progreso del escaneo"
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <span className="sub" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {status.total > 0 ? `${status.processed} / ${status.total}` : '—'}
          </span>
        </div>

        <p aria-live="polite">{status.message || (status.running ? 'Preparando…' : 'Sin escaneo en curso.')}</p>
        {status.currentFile && <p className="scan-file">{status.currentFile}</p>}

        {!status.running && !status.error && (
          <p className="sub">
            {status.added} nuevos · {status.updated} actualizados · {status.removed} eliminados
          </p>
        )}
        {status.error && <p className="login-error">{status.error}</p>}
      </div>
    </Sheet>
  );
}
