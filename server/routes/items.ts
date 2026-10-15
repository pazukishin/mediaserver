import type { FastifyInstance } from 'fastify';
import { findItemRow } from '../repositories/items.js';
import { resetState, setFavorite, setWatched, updateProgress } from '../repositories/playback.js';
import { favoriteBodySchema, idParamSchema, parseWith, progressBodySchema, resetBodySchema, watchedBodySchema } from './helpers.js';

export async function registerItemRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/items/:id/progress', async (request, reply) => {
    const { id } = parseWith(idParamSchema, request.params);
    const body = parseWith(progressBodySchema, request.body);
    const row = findItemRow(app.db, id);
    if (!row) return reply.code(404).send({ error: 'Elemento no encontrado' });
    const result = updateProgress(app.db, row.path, body, row.duration ?? 0);
    return { position: result.position, progress: result.progress, watched: result.watched };
  });

  app.post('/api/items/:id/watched', async (request, reply) => {
    const { id } = parseWith(idParamSchema, request.params);
    const body = parseWith(watchedBodySchema, request.body);
    const row = findItemRow(app.db, id);
    if (!row) return reply.code(404).send({ error: 'Elemento no encontrado' });
    const result = setWatched(app.db, row.path, body.watched);
    return { watched: result.watched, watchedAt: result.watchedAt, position: result.position };
  });

  app.post('/api/items/:id/favorite', async (request, reply) => {
    const { id } = parseWith(idParamSchema, request.params);
    const body = parseWith(favoriteBodySchema, request.body);
    const row = findItemRow(app.db, id);
    if (!row) return reply.code(404).send({ error: 'Elemento no encontrado' });
    const result = setFavorite(app.db, row.path, body.favorite);
    return { favorite: result.favorite, favoriteAt: result.favoriteAt };
  });

  app.post('/api/state/reset', async (request) => {
    const body = parseWith(resetBodySchema, request.body);
    return { ok: true, affected: resetState(app.db, body.scope) };
  });
}
