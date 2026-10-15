import { expect, test } from '@playwright/test';
import { login } from './helpers.js';

test.describe('búsqueda', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('hay un solo buscador en la pantalla de resultados', async ({ page }) => {
    await page.goto('/buscar');
    await expect(page.getByRole('heading', { name: 'Buscar en la biblioteca' })).toBeVisible();
    // El campo de la barra superior es el único: no se duplica en la página.
    await expect(page.getByRole('searchbox')).toHaveCount(1);
    await expect(page.getByRole('searchbox')).toBeFocused();
  });

  test('escribir y pulsar Intro lleva a los resultados', async ({ page }) => {
    await page.goto('/buscar');
    const field = page.getByRole('searchbox');
    await field.fill('Naturaleza');
    await field.press('Enter');

    await expect(page.getByRole('heading', { name: /Resultados para/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Naturaleza Salvaje' })).toBeVisible();
    await expect(page).toHaveURL(/q=Naturaleza/);
  });

  // En móvil el campo no ocupa la barra: se despliega con la lupa, que es la
  // misma búsqueda, y filtra donde estás en vez de mandarte a otra pantalla.
  test('la lupa despliega el buscador y filtra dentro del canal', async ({ page }) => {
    await page.goto('/c/Videos/Openings');
    await expect(page.getByRole('heading', { name: 'Openings', level: 1 })).toBeVisible();
    await expect(page.getByRole('searchbox')).toHaveCount(0);

    await page.getByRole('button', { name: 'Buscar' }).click();
    const field = page.getByRole('searchbox');
    await expect(field).toHaveAttribute('placeholder', /Openings/);

    await field.fill('Apertura 02');
    await field.press('Enter');

    await expect(page).toHaveURL(/\/c\/Videos\/Openings\?q=Apertura/);
    await expect(page.getByRole('heading', { name: 'Apertura 02' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Apertura 01' })).toHaveCount(0);
  });

  test('desde el filtro del canal se puede saltar a toda la biblioteca', async ({ page }) => {
    await page.goto('/c/Videos/Openings?q=Apertura');
    await expect(page.getByText(/Filtrando por «Apertura» en este canal/)).toBeVisible();

    await page.getByRole('link', { name: 'Buscar en toda la biblioteca' }).click();

    await expect(page).toHaveURL(/\/buscar\?q=Apertura/);
    await expect(page.getByRole('searchbox')).toHaveValue('Apertura');
    await expect(page.getByRole('heading', { name: 'Apertura 03' })).toBeVisible();
  });

  test('el ámbito de la búsqueda lo dice el marcador de posición', async ({ page }) => {
    await page.goto('/c/Videos/Openings');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByRole('searchbox')).toHaveAttribute('placeholder', /Buscar en «Openings»/);

    await page.goto('/favoritos');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByRole('searchbox')).toHaveAttribute('placeholder', /favoritos/);

    await page.goto('/');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByRole('searchbox')).toHaveAttribute('placeholder', /Buscar en la biblioteca/);
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

  test('el enlace de búsqueda es compartible y rellena el campo', async ({ page }) => {
    await page.goto('/buscar?q=Apertura');
    await expect(page.getByRole('searchbox')).toHaveValue('Apertura');
    await expect(page.getByRole('heading', { name: 'Apertura 01' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Apertura 02' })).toBeVisible();
  });
});
