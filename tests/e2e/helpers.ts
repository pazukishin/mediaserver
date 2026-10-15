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
/**
 * Desbordamiento horizontal, mirando también dentro de la región de contenido.
 * El armazón recorta lo que se salga (`overflow: hidden`), así que medir sólo el
 * documento ocultaría el problema.
 */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const content = document.getElementById('contenido');
    const docOverflow = doc.scrollWidth - doc.clientWidth;
    const contentOverflow = content ? content.scrollWidth - content.clientWidth : 0;
    return Math.max(docOverflow, contentOverflow);
  });
}

/**
 * Devuelve las tarjetas **visibles** que quedan tapadas por una barra, a lo
 * largo de todo el scroll. Hay que recortar primero cada tarjeta al área de la
 * región que se desplaza: las que están fuera de vista siguen teniendo
 * coordenadas y darían falsos positivos.
 */
export async function tarjetasTapadas(page: Page, selectorBarra: string): Promise<string[]> {
  return page.evaluate(async (selector) => {
    const scroller = document.getElementById('contenido') ?? document.scrollingElement;
    if (!scroller) return ['sin región de contenido'];
    const tapadas: string[] = [];
    for (let y = 0; y <= scroller.scrollHeight; y += 80) {
      scroller.scrollTop = y;
      await new Promise((resolve) => setTimeout(resolve, 20));
      const barra = document.querySelector(selector)?.getBoundingClientRect();
      if (!barra || barra.height === 0) continue;
      const area = scroller.getBoundingClientRect();
      for (const tarjeta of document.querySelectorAll('article.card')) {
        const rect = tarjeta.getBoundingClientRect();
        const visibleTop = Math.max(rect.top, area.top);
        const visibleBottom = Math.min(rect.bottom, area.bottom);
        if (visibleBottom - visibleTop <= 2) continue; // fuera de vista
        const tapada = Math.min(visibleBottom, barra.bottom) - Math.max(visibleTop, barra.top);
        if (tapada > 2) {
          tapadas.push(`${tarjeta.querySelector('.card-stretch')?.getAttribute('href')} con scroll ${y}`);
        }
      }
    }
    return [...new Set(tapadas)];
  }, selectorBarra);
}
