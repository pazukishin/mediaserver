import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

type Toast = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastContextValue = {
  notify: (message: string, options?: { actionLabel?: string; onAction?: () => void }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/** Avisos breves con acción opcional (deshacer), en lugar de fallar en silencio. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback<ToastContextValue['notify']>(
    (message, options) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current.slice(-2), { id, message, ...options }]);
      window.setTimeout(() => dismiss(id), options?.onAction ? 8000 : 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div className="toast" key={toast.id}>
            <span className="toast-text">{toast.message}</span>
            {toast.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.();
                  dismiss(toast.id);
                }}
              >
                {toast.actionLabel}
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              style={{ width: 28, height: 28 }}
              aria-label="Cerrar aviso"
              onClick={() => dismiss(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast necesita estar dentro de <ToastProvider>');
  return context;
}
