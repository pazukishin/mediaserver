import { expect, test } from '@playwright/test';
import { goToChannel, login } from './helpers.js';

test.describe('reproductor', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('abrir un archivo lleva a su ruta y muestra el reproductor completo', async ({ page }) => {
    await goToChannel(page, 'Videos', 'Openings');
    await page.getByRole('link', { name: 'Apertura 01' }).click();

    await expect(page).toHaveURL(/\/ver\/\d+$/);
    await expect(page.locator('.player-dock[data-mode="full"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Apertura 01', level: 1 })).toBeVisible();
  });

  test('al cerrar, la reproducción sigue con el mini reproductor', async ({ page }) => {
    await goToChannel(page, 'Videos', 'Openings');
    await page.getByRole('link', { name: 'Apertura 01' }).click();
    await expect(page.locator('.player-dock[data-mode="full"]')).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar el reproductor' }).click();

    const mini = page.locator('.miniplayer');
    await expect(mini).toBeVisible();
    await expect(mini).toContainText('Apertura 01');
    // Se ha vuelto al canal del que salimos, no al inicio.
    await expect(page.getByRole('heading', { name: 'Openings', level: 1 })).toBeVisible();
  });

  test('el mini reproductor sobrevive a navegar por la aplicación', async ({ page }) => {
    await goToChannel(page, 'Videos', 'Openings');
    await page.getByRole('button', { name: 'Reproducir todo' }).click();
    await expect(page.locator('.player-dock[data-mode="full"]')).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar el reproductor' }).click();
    // Navegación del cliente: una recarga completa sí perdería la cola.
    await page.getByRole('link', { name: 'Biblioteca', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Biblioteca', level: 1 })).toBeVisible();

    await expect(page.locator('.miniplayer')).toBeVisible();
    // Y no se ha desmontado el elemento de vídeo: la reproducción no se corta.
    await expect(page.locator('.player-dock video')).toHaveCount(1);
  });

  test('reproducir todo construye una cola con el resto del canal', async ({ page }) => {
    await goToChannel(page, 'Videos', 'Openings');
    await page.getByRole('button', { name: 'Reproducir todo' }).click();

    await expect(page.locator('.player-dock[data-mode="full"]')).toBeVisible();
    // En móvil la cola se abre como hoja inferior, no como columna lateral.
    await page.getByRole('button', { name: 'Ver la cola' }).click();
    const queue = page.getByRole('dialog', { name: 'Cola de reproducción' });
    await expect(queue).toBeVisible();
    await expect(queue.getByRole('button', { name: /Apertura 02/ })).toBeVisible();
    await expect(queue.getByRole('button', { name: /Apertura 03/ })).toBeVisible();
  });

  test('seleccionar otra pista de la cola cambia de archivo', async ({ page }) => {
    await goToChannel(page, 'Videos', 'Openings');
    await page.getByRole('button', { name: 'Reproducir todo' }).click();
    await expect(page.getByRole('heading', { name: 'Apertura 01', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Ver la cola' }).click();
    await page
      .getByRole('dialog', { name: 'Cola de reproducción' })
      .getByRole('button', { name: /Apertura 02/ })
      .click();
    await expect(page.getByRole('heading', { name: 'Apertura 02', level: 1 })).toBeVisible();
  });

  test('marcar como visto se refleja en la rejilla del canal', async ({ page }) => {
    await goToChannel(page, 'Videos', 'Openings');
    await page.getByRole('link', { name: 'Apertura 02' }).click();
    await page.getByRole('button', { name: 'Marcar como visto' }).click();
    await page.getByRole('button', { name: 'Cerrar el reproductor' }).click();

    await expect(page.getByRole('link', { name: 'Apertura 02' }).locator('xpath=ancestor::article').getByText('Visto')).toBeVisible();

    // Se revierte para no ensuciar el estado del resto de pruebas.
    await page.goto('/c/Videos/Openings');
    await page.getByRole('link', { name: 'Apertura 02' }).click();
    await page.getByRole('button', { name: 'Marcar como no visto' }).click();
  });

  test('un contenedor que el navegador no soporta lo explica en vez de quedarse en negro', async ({ page }) => {
    await goToChannel(page, 'Videos', 'Openings');
    await page.getByRole('link', { name: 'Apertura 03' }).click();
    await expect(page.getByText('Este formato no se reproduce en el navegador')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Descargar el archivo' })).toBeVisible();
  });
});
