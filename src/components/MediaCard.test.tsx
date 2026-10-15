// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import type { Item } from '../lib/types.js';
import { MediaCard } from './MediaCard.js';

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: 7,
    title: 'Apertura de prueba',
    kind: 'video',
    category: 'Videos',
    channel: 'Openings',
    extension: '.mp4',
    duration: 300,
    position: 0,
    progress: 0,
    watched: false,
    favorite: false,
    createdAt: null,
    addedAt: null,
    watchedAt: null,
    favoriteAt: null,
    sizeBytes: null,
    streamUrl: '/api/stream/7',
    artworkUrl: null,
    previewUrl: null,
    ...overrides,
  };
}

function renderCard(props: Partial<Parameters<typeof MediaCard>[0]> = {}) {
  return render(
    <MemoryRouter>
      <MediaCard item={item()} to="/ver/7" {...props} />
    </MemoryRouter>,
  );
}

describe('MediaCard', () => {
  test('expone el título y el canal como texto legible', () => {
    renderCard();
    expect(screen.getByRole('heading', { name: 'Apertura de prueba' })).toBeInTheDocument();
    expect(screen.getByText('Openings · 5:00')).toBeInTheDocument();
  });

  test('toda la tarjeta es un enlace navegable con el título como nombre accesible', () => {
    renderCard();
    const link = screen.getByRole('link', { name: 'Apertura de prueba' });
    expect(link).toHaveAttribute('href', '/ver/7');
  });

  test('sin carátula muestra un sustituto en lugar de un hueco roto', () => {
    const { container } = renderCard();
    expect(container.querySelector('.artwork-fallback')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  test('el botón de favorito informa de su estado y pide el cambio contrario', async () => {
    const onFavorite = vi.fn();
    renderCard({ onFavorite });

    const button = screen.getByRole('button', { name: 'Añadir Apertura de prueba a favoritos' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(button);
    expect(onFavorite).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), true);
  });

  test('marca el favorito ya activo y ofrece quitarlo', () => {
    renderCard({ item: item({ favorite: true }), onFavorite: vi.fn() });
    expect(screen.getByRole('button', { name: 'Quitar Apertura de prueba de favoritos' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('muestra la barra de progreso sólo cuando hay algo empezado', () => {
    const { container, rerender } = render(
      <MemoryRouter>
        <MediaCard item={item({ progress: 0.4, position: 120 })} to="/ver/7" />
      </MemoryRouter>,
    );
    expect(container.querySelector('.progress')).not.toBeNull();
    expect(screen.getByText('Quedan 3 min')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <MediaCard item={item({ progress: 0 })} to="/ver/7" />
      </MemoryRouter>,
    );
    expect(container.querySelector('.progress')).toBeNull();
  });

  test('un archivo visto no vuelve a pintar progreso y avisa de que está visto', () => {
    const { container } = render(
      <MemoryRouter>
        <MediaCard item={item({ watched: true, progress: 0.98 })} to="/ver/7" />
      </MemoryRouter>,
    );
    expect(container.querySelector('.progress')).toBeNull();
    expect(screen.getByText('Visto')).toBeInTheDocument();
  });
});
