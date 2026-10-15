import { type ReactNode, useCallback, useEffect } from 'react';
import { useBackDismiss } from '../lib/backDismiss.js';
import { useEscape, useFocusTrap, useScrollLock } from '../lib/hooks.js';

type SheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Acciones al pie de la hoja. */
  footer?: ReactNode;
  /** Texto descriptivo para lectores de pantalla. */
  description?: string;
};

/**
 * Hoja inferior en móvil, diálogo centrado en escritorio. Atrapa el foco, se
 * cierra con Escape, con el botón atrás y pulsando fuera, y devuelve el foco al
 * elemento que la abrió.
 */
export function Sheet({ open, title, onClose, children, footer, description }: SheetProps) {
  const close = useCallback(() => onClose(), [onClose]);
  const ref = useFocusTrap<HTMLDivElement>(open);

  useScrollLock(open);
  useEscape(open, close);
  useBackDismiss(open, close);

  // Cerrar al pulsar fuera. Se escucha en el documento y no en el fondo para no
  // poner un manejador sobre un elemento decorativo (accesibilidad y teclado).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const sheet = ref.current;
      if (sheet && !sheet.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close, ref]);

  if (!open) return null;

  return (
    <div className="overlay">
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <span className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-head">
          <div>
            <h2>{title}</h2>
            {description && (
              <p className="sub" style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)' }}>
                {description}
              </p>
            )}
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Cerrar">
            ×
          </button>
        </div>
        {children}
        {footer && (
          <div className="fila" style={{ justifyContent: 'flex-end' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
