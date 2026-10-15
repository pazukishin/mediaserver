import { expect, test } from '@playwright/test';
import { horizontalOverflow, login } from './helpers.js';

test.describe('navegación en móvil', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('usa la navegación inferior y no la barra lateral', async ({ page }) => {
    const bottomNav = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.getByRole('link')).toHaveCount(4);
    // La barra lateral de escritorio no debe existir en un teléfono.
    await expect(page.locator('.sidebar')).toBeHidden();
  });

  test('marca el destino activo con aria-current', async ({ page }) => {
    // `exact` porque el nombre se compara por subcadena: «Ver la biblioteca»
    // también contendría «Biblioteca».
    await expect(page.getByRole('link', { name: 'Inicio', exact: true })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('link', { name: 'Biblioteca', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Biblioteca', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Biblioteca', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('recorre biblioteca, categoría y canal', async ({ page }) => {
    await page.goto('/biblioteca');
    await expect(page.getByRole('heading', { name: 'Biblioteca', level: 1 })).toBeVisible();

    await page
      .getByRole('link', { name: /Videos/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Videos', level: 1 })).toBeVisible();

    await page
      .getByRole('link', { name: /Openings/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Openings', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Apertura 01' })).toBeVisible();
  });

  test('el gesto de volver del sistema retrocede de canal a categoría', async ({ page }) => {
    await page.goto('/biblioteca');
    await page
      .getByRole('link', { name: /Videos/ })
      .first()
      .click();
    await page
      .getByRole('link', { name: /Openings/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Openings', level: 1 })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Videos', level: 1 })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Biblioteca', level: 1 })).toBeVisible();
  });

  test('ninguna pantalla desborda horizontalmente', async ({ page }) => {
    for (const route of ['/', '/biblioteca', '/favoritos', '/buscar', '/ajustes']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      expect(await horizontalOverflow(page), `desbordamiento en ${route}`).toBeLessThanOrEqual(0);
    }
  });

  test('los filtros del canal cambian lo que se ve', async ({ page }) => {
    await page.goto('/c/Videos/Openings');
    await expect(page.getByRole('heading', { name: 'Apertura 01' })).toBeVisible();

    await page.getByRole('button', { name: 'Favoritos', exact: true }).click();
    await expect(page.getByText('No hay archivos con estos filtros')).toBeVisible();

    await page.getByRole('button', { name: 'Todos', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Apertura 01' })).toBeVisible();
  });

  test('se puede marcar un favorito y aparece en Favoritos', async ({ page }) => {
    await page.goto('/c/Videos/Openings');
    await page.getByRole('button', { name: 'Añadir Apertura 01 a favoritos' }).click();

    await page.goto('/favoritos');
    await expect(page.getByRole('heading', { name: 'Apertura 01' })).toBeVisible();

    // Se deja como estaba para no afectar a otros tests.
    await page.getByRole('button', { name: 'Quitar Apertura 01 de favoritos' }).click();
    await expect(page.getByText('Todavía no tienes favoritos')).toBeVisible();
  });
});
