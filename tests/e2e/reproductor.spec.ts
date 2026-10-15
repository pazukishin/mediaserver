import { expect, test } from '@playwright/test';
import { goToChannel, login, tarjetasTapadas } from './helpers.js';

test.describe('reproductor', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  /**
   * Regresión: `.m4a`, `.aac` y `.wav` se declaraban como `audio/object`, que en
   * el reproductor sólo vale para URLs `blob:`. Con una URL normal no montaba
   * ningún elemento de medios, así que el archivo no sonaba y el botón de
   * reproducir lanzaba «media not ready».
   */
  test('los formatos que el reproductor no reconoce de fábrica también suenan', async ({ page }) => {
    for (const archivo of ['Canción Tres', 'Canción Cuatro']) {
      await goToChannel(page, 'Audio', 'Canciones');
      await page.getByRole('link', { name: archivo, exact: true }).click();

      const media = page.locator('.player-dock audio, .player-dock video');
      await expect(media, `${archivo} no montó el reproductor`).toHaveCount(1);
      await expect
        .poll(async () => media.evaluate((element: HTMLMediaElement) => element.readyState), { message: `${archivo} no cargó` })
        .toBeGreaterThanOrEqual(2);

      await page.getByRole('button', { name: 'Reproducir' }).first().click();
      await expect
        .poll(async () => media.evaluate((element: HTMLMediaElement) => element.currentTime), { message: `${archivo} no avanza` })
        .toBeGreaterThan(0);
    }
  });

  test('abrir un archivo lleva a su ruta y muestra el reproductor completo', async ({ page }) => {
    await goToChannel(page, 'Videos', 'Openings');
    await page.getByRole('link', { name: 'Apertura 01' }).click();

    await expect(page).toHaveURL(/\/ver\/\d+$/);
    await expect(page.locator('.player-dock[data-mode="full"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Apertura 01', level: 1 })).toBeVisible();
  });

  // Regresión: la X flotaba sobre el vídeo en z-index 5, mientras que los
  // controles de la librería van en z-index 50. Según si estaban visibles o no,
  // el clic caía en la X o en los controles: cerrar era una lotería.
  test('el botón de cerrar recibe el clic con los controles ocultos y visibles', async ({ page }) => {
    await goToChannel(page, 'Videos', 'Openings');
    await page.getByRole('link', { name: 'Apertura 01' }).click();
    await expect(page.locator('.player-dock[data-mode="full"]')).toBeVisible();

    const cierraRecibeElClic = () =>
      page.getByRole('button', { name: 'Cerrar el reproductor' }).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return hit !== null && (element === hit || element.contains(hit));
      });

    // Recién abierto: los controles del vídeo están ocultos.
    expect(await cierraRecibeElClic(), 'con los controles ocultos').toBe(true);

    // Y con los controles ya visibles (ratón encima unos segundos).
    await page.mouse.move(400, 300);
    await page.waitForTimeout(3000);
    expect(await cierraRecibeElClic(), 'con los controles visibles').toBe(true);

    await page.getByRole('button', { name: 'Cerrar el reproductor' }).click();
    await expect(page.locator('.miniplayer')).toBeVisible();
  });

  // Regresión: el mini reproductor flotaba sobre la rejilla, así que un toque
  // sobre una tarjeta que quedara debajo lo recibía la barra: en móvil abría el
  // vídeo anterior en lugar del elegido y en escritorio el toque se perdía.
  test('el mini reproductor no tapa ninguna tarjeta de la galería', async ({ page }) => {
    await goToChannel(page, 'Videos', 'Openings');
    await page.getByRole('link', { name: 'Apertura 01' }).click();
    await expect(page.locator('.player-dock[data-mode="full"]')).toBeVisible();

    await page.getByRole('button', { name: 'Cerrar el reproductor' }).click();
    await expect(page.locator('.miniplayer')).toBeVisible();

    // Pantalla corta: así la rejilla se desplaza de verdad y la comprobación
    // recorre todas las posiciones de scroll.
    await page.setViewportSize({ width: 360, height: 480 });
    await page.waitForTimeout(300);
    expect(await tarjetasTapadas(page, '.miniplayer')).toEqual([]);
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
