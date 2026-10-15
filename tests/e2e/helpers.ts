import { expect, type Page } from '@playwright/test';

/** Credenciales de los tests. Deben coincidir con `scripts/e2e-server.mjs`. */
export const CREDENTIALS = { username: 'e2e', password: 'contrasena-de-pruebas' };

export const BASE_URL = `http://127.0.0.1:${Number(process.env.E2E_PORT ?? 3210)}`;

/** Inicia sesión desde la pantalla de acceso y espera al inicio. */
export async function login(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Usuario').fill(CREDENTIALS.username);
  await page.getByLabel('Contraseña').fill(CREDENTIALS.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
}

/** Abre la biblioteca completa por la ruta de canales. */
export async function goToChannel(page: Page, category: string, channel: string): Promise<void> {
  await page.goto(`/c/${encodeURIComponent(category)}/${encodeURIComponent(channel)}`);
  await expect(page.getByRole('heading', { name: channel, level: 1 })).toBeVisible();
}

/** Ancho del documento frente al viewport: detecta desbordamiento horizontal. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
