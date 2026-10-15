import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { login } from './helpers.js';

const OUTPUT = 'docs/capturas';

/**
 * Capturas de la interfaz en viewport de móvil. Son la evidencia visual de la
 * rama: `pnpm test:e2e` las vuelve a generar en docs/capturas/.
 */
test.describe('capturas para revisión', () => {
  test.beforeAll(async () => {
    await mkdir(OUTPUT, { recursive: true });
  });

  test('recorre las pantallas principales y las guarda', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('Usuario')).toBeVisible();
    await page.screenshot({ path: `${OUTPUT}/01-acceso.png` });

    await login(page);
    await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${OUTPUT}/02-inicio.png` });

    await page.goto('/biblioteca');
    await expect(page.getByRole('heading', { name: 'Biblioteca', level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${OUTPUT}/03-biblioteca.png` });

    await page.goto('/c/Videos/Openings');
    await expect(page.getByRole('heading', { name: 'Apertura 01' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${OUTPUT}/04-canal.png` });

    await page.getByRole('link', { name: 'Apertura 01' }).click();
    await expect(page.locator('.player-dock[data-mode="full"]')).toBeVisible();
    await page.screenshot({ path: `${OUTPUT}/05-reproductor.png` });

    await page.getByRole('button', { name: 'Cerrar el reproductor' }).click();
    // Navegación del cliente: una recarga completa perdería la cola y con ella
    // el mini reproductor que queremos retratar.
    await page.getByRole('link', { name: 'Favoritos', exact: true }).click();
    await expect(page.locator('.miniplayer')).toBeVisible();
    await page.screenshot({ path: `${OUTPUT}/06-mini-reproductor.png` });

    await page.goto('/ajustes');
    await page.getByRole('button', { name: 'Claro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.screenshot({ path: `${OUTPUT}/07-ajustes-tema-claro.png` });
    await page.getByRole('button', { name: 'Oscuro' }).click();
  });
});
