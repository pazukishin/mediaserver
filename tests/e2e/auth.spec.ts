import { expect, test } from '@playwright/test';
import { CREDENTIALS, login } from './helpers.js';

test.describe('acceso', () => {
  test('la pantalla de acceso pide usuario y contraseña', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('Usuario')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeDisabled();
  });

  test('con credenciales incorrectas avisa sin revelar cuál falla', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Usuario').fill(CREDENTIALS.username);
    await page.getByLabel('Contraseña').fill('equivocada');
    await page.getByRole('button', { name: 'Entrar' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/incorrectos/i);
    // La contraseña se limpia para no dejarla escrita en pantalla.
    await expect(page.getByLabel('Contraseña')).toHaveValue('');
  });

  test('al entrar se llega al inicio y la sesión sobrevive a una recarga', async ({ page }) => {
    await login(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
  });

  test('una ruta profunda sin sesión lleva al acceso y respeta el destino', async ({ page }) => {
    await page.goto('/biblioteca');
    await expect(page.getByLabel('Usuario')).toBeVisible();
    await page.getByLabel('Usuario').fill(CREDENTIALS.username);
    await page.getByLabel('Contraseña').fill(CREDENTIALS.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    // No se pierde el destino: al entrar se ve la biblioteca, no el inicio.
    await expect(page.getByRole('heading', { name: 'Biblioteca', level: 1 })).toBeVisible();
  });

  test('cerrar sesión devuelve al acceso', async ({ page }) => {
    await login(page);
    await page.goto('/ajustes');
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByLabel('Usuario')).toBeVisible();
  });
});
