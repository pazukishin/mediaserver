import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findChannelImage } from '../server/services/artwork.js';
import { createTempDir } from './helpers/fixtures.js';

function touch(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, 'no es una imagen de verdad, sólo importa el nombre');
}

/** Carpeta `media/Audio/<album>` con las imágenes indicadas. */
function albumWith(images: string[]): { mediaDir: string; category: string; channel: string } {
  const mediaDir = createTempDir('mediaserver-artwork-');
  const category = 'Audio';
  const channel = 'Pokemon Total ¡Las Nuevas Canciones de la Serie de TV! Karaokemon Pokemon (Español España)';
  for (const image of images) touch(join(mediaDir, category, channel, image));
  return { mediaDir, category, channel };
}

describe('carátula de una carpeta de álbum', () => {
  it('usa cover.jpg cuando existe', () => {
    const { mediaDir, category, channel } = albumWith(['cover.jpg', 'pokemon total.jpg']);
    expect(findChannelImage(mediaDir, category, channel)).toBe(join(mediaDir, category, channel, 'cover.jpg'));
  });

  it('reconoce los demás nombres canónicos', () => {
    const { mediaDir, category, channel } = albumWith(['folder.png', 'otra.jpg']);
    expect(findChannelImage(mediaDir, category, channel)).toBe(join(mediaDir, category, channel, 'folder.png'));
  });

  // El caso real que motivó la heurística: la portada se llama como el álbum,
  // y en la misma carpeta hay contraportada y una foto del CD.
  it('elige la imagen que se parece al álbum y descarta contraportada y CD', () => {
    const { mediaDir, category, channel } = albumWith(['cd de pokemon total (españa).jpg', 'pokemon total Back.png', 'pokemon total.jpg']);
    expect(findChannelImage(mediaDir, category, channel)).toBe(join(mediaDir, category, channel, 'pokemon total.jpg'));
  });

  it('aunque no se parezca al álbum, prefiere cualquier imagen a ninguna', () => {
    const { mediaDir, category, channel } = albumWith(['portada definitiva.jpg']);
    expect(findChannelImage(mediaDir, category, channel)).toBe(join(mediaDir, category, channel, 'portada definitiva.jpg'));
  });

  it('ignora ficheros que no son imágenes', () => {
    const { mediaDir, category, channel } = albumWith(['leeme.txt', 'notas.md']);
    expect(findChannelImage(mediaDir, category, channel)).toBeNull();
  });

  it('devuelve null si la carpeta no existe', () => {
    const mediaDir = createTempDir('mediaserver-artwork-');
    expect(findChannelImage(mediaDir, 'Audio', 'NoExiste')).toBeNull();
  });
});
