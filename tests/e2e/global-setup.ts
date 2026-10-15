import { request } from '@playwright/test';
import { BASE_URL, CREDENTIALS } from './helpers.js';

/**
 * Deja la biblioteca escaneada antes de que empiecen los tests, usando la propia
 * API (sin navegador). El escaneo es una operación real y lenta: hacerlo en cada
 * test lo volvería insoportable.
 */
export default async function globalSetup(): Promise<void> {
  const context = await request.newContext({ baseURL: BASE_URL });

  const login = await context.post('/api/auth/login', { data: CREDENTIALS });
  if (!login.ok()) {
    throw new Error(`No se pudo iniciar sesión para preparar los tests: ${login.status()} ${await login.text()}`);
  }

  const health = await context.get('/api/health');
  const healthBody = (await health.json()) as { items: number };
  if (healthBody.items > 0) {
    // Estado limpio en cada ejecución: los tests comparten servidor y base.
    await context.post('/api/state/reset', { data: { scope: 'all' } });
    await context.dispose();
    return;
  }

  const started = await context.post('/api/scan');
  if (!started.ok() && started.status() !== 409) {
    throw new Error(`No se pudo lanzar el escaneo: ${started.status()} ${await started.text()}`);
  }

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await context.get('/api/scan/status');
    const body = (await status.json()) as { running: boolean; error: string | null; processed: number };
    if (body.error) throw new Error(`El escaneo falló: ${body.error}`);
    if (!body.running) {
      const check = await context.get('/api/health');
      const items = ((await check.json()) as { items: number }).items;
      if (items === 0) throw new Error('El escaneo terminó sin catalogar ningún archivo');
      await context.dispose();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await context.dispose();
  throw new Error('El escaneo no terminó a tiempo');
}
