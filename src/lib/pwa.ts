/**
 * Registro del service worker. Sólo en producción: en desarrollo invalidaría el
 * recambio en caliente de Vite y serviría versiones cacheadas.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      /* sin service worker la app sigue funcionando, sólo pierde el modo offline */
    });
  });
}
