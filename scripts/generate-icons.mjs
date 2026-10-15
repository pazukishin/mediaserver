/**
 * Genera los PNG de la PWA a partir de los SVG, usando el Chromium de Playwright.
 * Así los iconos y el favicon salen siempre de la misma fuente vectorial.
 *
 *   pnpm icons
 */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const TARGETS = [
  { source: 'public/icons/icon.svg', output: 'public/icons/icon-192.png', size: 192 },
  { source: 'public/icons/icon.svg', output: 'public/icons/icon-512.png', size: 512 },
  { source: 'public/icons/icon-maskable.svg', output: 'public/icons/icon-maskable-512.png', size: 512 },
  { source: 'public/icons/icon.svg', output: 'public/icons/apple-touch-icon.png', size: 180 },
];

const browser = await chromium.launch();

for (const target of TARGETS) {
  const page = await browser.newPage({
    viewport: { width: target.size, height: target.size },
    deviceScaleFactor: 1,
  });
  const svg = readFileSync(target.source, 'utf8').replace('<svg', `<svg width="${target.size}" height="${target.size}"`);
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: target.output, omitBackground: true });
  await page.close();
  console.log(`icono generado: ${target.output} (${target.size}×${target.size})`);
}

await browser.close();
