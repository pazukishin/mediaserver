import { expect, test } from '@playwright/test';
import { login } from './helpers.js';

test.describe('búsqueda', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('encuentra archivos por título y lo refleja en la URL', async ({ page }) => {
    await page.goto('/buscar');
    await expect(page.getByRole('heading', { name: 'Buscar en la biblioteca' })).toBeVisible();

    await page.locator('main').getByLabel('Buscar en la biblioteca').fill('Naturaleza');

    await expect(page.getByRole('heading', { name: /Resultados para/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Naturaleza Salvaje' })).toBeVisible();
    await expect(page).toHaveURL(/q=Naturaleza/);
  });

  test('no distingue mayúsculas ni acentos', async ({ page }) => {
    await page.goto('/buscar?q=CANCION');
    await expect(page.getByRole('heading', { name: 'Canción Uno' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Canción Dos' })).toBeVisible();
  });

  test('avisa cuando no hay resultados', async ({ page }) => {
    await page.goto('/buscar?q=zzzznoexiste');
    await expect(page.getByText('Sin resultados')).toBeVisible();
  });

  test('el enlace de búsqueda es compartible', async ({ page }) => {
    await page.goto('/buscar?q=Apertura');
    await expect(page.getByRole('heading', { name: 'Apertura 01' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Apertura 02' })).toBeVisible();
  });
});
