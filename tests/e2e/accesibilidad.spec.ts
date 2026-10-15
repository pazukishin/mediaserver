import { expect, test } from '@playwright/test';
import { login } from './helpers.js';

test.describe('accesibilidad y semántica', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('el documento declara el idioma y las regiones principales', async ({ page }) => {
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navegación principal' }).first()).toBeVisible();
  });

  test('todas las imágenes tienen atributo alt', async ({ page }) => {
    await page.goto('/c/Videos/Openings');
    await expect(page.getByRole('heading', { name: 'Apertura 01' })).toBeVisible();
    const withoutAlt = await page.locator('img:not([alt])').count();
    expect(withoutAlt).toBe(0);
  });

  test('los enlaces y botones tienen nombre accesible', async ({ page }) => {
    await page.goto('/c/Videos/Openings');
    const nameless = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('a[href], button'));
      return nodes.filter((node) => {
        const text = (node.textContent ?? '').trim();
        const labelled = node.getAttribute('aria-label') ?? node.getAttribute('title') ?? '';
        return text.length === 0 && labelled.trim().length === 0;
      }).length;
    });
    expect(nameless).toBe(0);
  });

  test('el foco por teclado es visible', async ({ page }) => {
    await page.goto('/biblioteca');
    // Esperar a que la aplicación esté montada: si se tabula durante el
    // esqueleto de arranque no hay nada enfocable y el foco se queda en `body`.
    await expect(page.getByRole('heading', { name: 'Biblioteca', level: 1 })).toBeVisible();

    // El contorno puede estar en el propio elemento o en la caja del campo que
    // lo envuelve (un input dentro de `.field` no debe dibujar dos marcos).
    const focused = async () =>
      page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        if (!element) return null;
        const wrapper = element.closest('.field');
        const owner = wrapper && getComputedStyle(wrapper).outlineStyle !== 'none' ? wrapper : element;
        const style = getComputedStyle(owner);
        return {
          etiqueta: `${element.tagName.toLowerCase()}.${element.className}`,
          quienDibuja: owner === element ? 'el propio elemento' : 'su caja .field',
          contorno: style.outlineStyle,
          grosor: Number.parseFloat(style.outlineWidth) || 0,
        };
      });

    await page.keyboard.press('Tab');
    const primero = await focused();
    expect(primero?.contorno, `primer foco: ${primero?.etiqueta}`).not.toBe('none');
    expect(primero?.grosor).toBeGreaterThanOrEqual(2);

    await page.keyboard.press('Tab');
    const segundo = await focused();
    expect(segundo?.contorno, `segundo foco: ${segundo?.etiqueta}`).not.toBe('none');
    expect(segundo?.grosor).toBeGreaterThanOrEqual(2);
  });

  // Regresión: los `<svg>` con `viewBox` y sin `width`/`height` no tienen
  // tamaño intrínseco. Dentro de un botón o un chip salían de 0 px (icono
  // invisible) o de ~300 px (botón de 300 px de alto). Los tests de nombre
  // accesible no lo ven, porque el botón sigue funcionando sin su icono.
  test('los iconos tienen un tamaño real, ni invisibles ni desproporcionados', async ({ page }) => {
    // La sesión ya está iniciada por el `beforeEach`.
    for (const route of ['/', '/biblioteca', '/c/Videos/Openings', '/favoritos', '/ajustes']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      const malos = await page.evaluate(() => {
        const esVisible = (element: Element | null): boolean => {
          let node: Element | null = element;
          while (node) {
            if (getComputedStyle(node).display === 'none') return false;
            node = node.parentElement;
          }
          return true;
        };
        return Array.from(document.querySelectorAll('button svg, a svg'))
          .filter((svg) => esVisible(svg))
          .map((svg) => {
            const rect = svg.getBoundingClientRect();
            return {
              ancho: Math.round(rect.width),
              alto: Math.round(rect.height),
              padre: `${svg.parentElement?.tagName.toLowerCase()}.${String(svg.parentElement?.className).slice(0, 24)}`,
            };
          })
          .filter((medida) => medida.ancho === 0 || medida.alto === 0 || medida.ancho > 48 || medida.alto > 48)
          .map((medida) => `${medida.padre}: ${medida.ancho}x${medida.alto}`);
      });

      expect(malos, `iconos mal dimensionados en ${route}`).toEqual([]);
    }
  });

  test('Escape cierra la hoja de confirmación y devuelve el foco', async ({ page }) => {
    await page.goto('/ajustes');
    await page.getByRole('button', { name: 'Reiniciar el progreso de reproducción' }).click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: 'Reiniciar el progreso de reproducción' })).toBeFocused();
  });

  test('el botón atrás del navegador cierra la hoja', async ({ page }) => {
    await page.goto('/ajustes');
    await page.getByRole('button', { name: 'Quitar todos los favoritos' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('el tema se aplica al documento y se puede cambiar', async ({ page }) => {
    await page.goto('/ajustes');
    const html = page.locator('html');

    await page.getByRole('button', { name: 'Claro' }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');

    await page.getByRole('button', { name: 'Oscuro' }).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
  });

  test('los destinos táctiles de la navegación son suficientemente grandes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'movil', 'Sólo aplica a pantallas táctiles');

    const sizes = await page.locator('.bottomnav a').evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      }),
    );

    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) {
      expect(size.height).toBeGreaterThanOrEqual(44);
      expect(size.width).toBeGreaterThanOrEqual(44);
    }
  });

  test('el progreso del escaneo se anuncia a lectores de pantalla', async ({ page }) => {
    await page
      .getByRole('button', { name: /Escanear/ })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('progressbar')).toBeVisible();
    await page
      .getByRole('button', { name: /Cancelar el escaneo|Cerrar/ })
      .first()
      .click();
  });
});
