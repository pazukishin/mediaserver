/*
 * Resuelve el tema antes del primer pintado. Debe ejecutarse de forma bloqueante
 * en el <head> y ser un fichero externo (nada de scripts en línea) para que la
 * política de seguridad de contenido del servidor pueda ser `script-src 'self'`.
 */
(function () {
  try {
    var stored = window.localStorage.getItem('ms.theme');
    var preference = stored ? JSON.parse(stored) : 'system';
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  } catch (error) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
