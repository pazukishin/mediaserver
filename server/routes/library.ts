import type { FastifyInstance } from 'fastify';
import {
  categorySummaries,
  channelItemIds,
  channelSummaries,
  continueWatching,
  countItems,
  findItemRow,
  libraryStats,
  listItems,
  recentlyAdded,
  toItem,
} from '../repositories/items.js';
import { artworkQuerySchema, idParamSchema, itemsQuerySchema, parseWith, previewQuerySchema } from './helpers.js';

const HOME_LIMIT = 12;
const IMMUTABLE_IMAGE = 'private, max-age=31536000, immutable';

export async function registerLibraryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/home', async () => ({
    continueWatching: continueWatching(app.db, HOME_LIMIT),
    recentlyAdded: recentlyAdded(app.db, HOME_LIMIT),
    categories: categorySummaries(app.db),
    stats: libraryStats(app.db),
  }));

  app.get('/api/categories', async () => ({ categories: categorySummaries(app.db) }));

  app.get('/api/channels', async (request) => {
    const query = request.query as Record<string, unknown>;
    const category = typeof query.category === 'string' && query.category.trim().length > 0 ? query.category.trim() : undefined;
    return { channels: channelSummaries(app.db, category) };
  });

  app.get('/api/items', async (request) => {
    const query = parseWith(itemsQuerySchema, request.query);
    const total = countItems(app.db, query);
    return { items: listItems(app.db, query), total, offset: query.offset, limit: query.limit };
  });

  app.get('/api/items/:id', async (request, reply) => {
    const { id } = parseWith(idParamSchema, request.params);
    const row = findItemRow(app.db, id);
    if (!row) return reply.code(404).send({ error: 'Elemento no encontrado' });
    return toItem(row);
  });

  app.get('/api/items/:id/queue', async (request, reply) => {
    const { id } = parseWith(idParamSchema, request.params);
    const row = findItemRow(app.db, id);
    if (!row) return reply.code(404).send({ error: 'Elemento no encontrado' });
    return { ids: channelItemIds(app.db, row.category, row.channel) };
  });

  app.get('/api/channels/artwork', async (request, reply) => {
    const query = parseWith(artworkQuerySchema, request.query);
    if (!query.category || !query.channel) return reply.code(404).send({ error: 'Canal no encontrado' });
    const payload = app.latestChannelArtwork(query.category, query.channel);
    if (!payload) return reply.code(404).send({ error: 'Carátula no encontrada' });
    return reply.header('Cache-Control', IMMUTABLE_IMAGE).type(payload.contentType).send(payload.data);
  });

  app.get('/api/items/:id/artwork', async (request, reply) => {
    const { id } = parseWith(idParamSchema, request.params);
    const row = findItemRow(app.db, id);
    if (!row?.cover) return reply.code(404).send({ error: 'Carátula no encontrada' });
    const payload = app.readCover(row.cover);
    if (!payload) return reply.code(404).send({ error: 'Carátula no encontrada' });
    return reply.header('Cache-Control', IMMUTABLE_IMAGE).type(payload.contentType).send(payload.data);
  });

  app.get('/api/items/:id/artwork/preview', async (request, reply) => {
    const { id } = parseWith(idParamSchema, request.params);
    const { index } = parseWith(previewQuerySchema, request.query);
    const row = findItemRow(app.db, id);
    if (!row) return reply.code(404).send({ error: 'Elemento no encontrado' });
    const name = await app.ensurePreview(row.path, row.duration ?? 0, index);
    const payload = name ? app.readCover(name) : null;
    if (!payload) return reply.code(404).send({ error: 'Vista previa no disponible' });
    return reply.header('Cache-Control', IMMUTABLE_IMAGE).type('image/jpeg').send(payload.data);
  });
}
