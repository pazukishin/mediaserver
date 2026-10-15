import { expect, test } from '@playwright/test';
import { login } from './helpers.js';

test.describe('escritorio', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('usa la barra lateral y oculta la navegación inferior', async ({ page }) => {
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.bottomnav')).toBeHidden();
  });

  test('la rejilla aprovecha el ancho disponible', async ({ page }) => {
    await page.goto('/c/Videos/Openings');
    await expect(page.getByRole('heading', { name: 'Apertura 01' })).toBeVisible();

    const columns = await page
      .locator('.grid')
      .first()
      .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length);
    expect(columns).toBeGreaterThanOrEqual(3);
  });

  test('la búsqueda de la barra superior navega al pulsar Intro', async ({ page }) => {
    const field = page.getByRole('banner').getByRole('search');
    await field.getByRole('searchbox').fill('Naturaleza');
    await field.getByRole('searchbox').press('Enter');

    await expect(page).toHaveURL(/\/buscar\?q=Naturaleza/);
    await expect(page.getByRole('heading', { name: 'Naturaleza Salvaje' })).toBeVisible();
  });

  test('las categorías aparecen en la barra lateral', async ({ page }) => {
    const sidebar = page.locator('.sidebar');
    await expect(sidebar.getByRole('link', { name: /Videos/ })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /Audio/ })).toBeVisible();
  });

  test('el reproductor muestra la cola en una columna lateral', async ({ page }) => {
    await page.goto('/c/Videos/Openings');
    await page.getByRole('button', { name: 'Reproducir todo' }).click();

    await expect(page.locator('.dock-queue')).toBeVisible();
    await expect(page.locator('.player-dock')).toHaveCSS('grid-template-columns', /340px/);
  });
});
