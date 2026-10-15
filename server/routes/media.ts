import { createReadStream, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { findItemRow } from '../repositories/items.js';
import { contentTypeFor } from '../repositories/types.js';
import { idParamSchema, parseWith } from './helpers.js';

type ByteRange = { start: number; end: number };

/** Cabecera `Range` de un solo rango; soporta `bytes=a-b`, `bytes=a-` y `bytes=-n`. */
export function parseRange(header: string | undefined, fileSize: number): ByteRange | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return { start: -1, end: -1 };
  const rawStart = match[1] ?? '';
  const rawEnd = match[2] ?? '';
  if (rawStart === '' && rawEnd === '') return { start: -1, end: -1 };
  let start: number;
  let end: number;
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return { start: -1, end: -1 };
    start = Math.max(fileSize - suffix, 0);
    end = fileSize - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? fileSize - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= fileSize) return { start: -1, end: -1 };
  return { start, end: Math.min(end, fileSize - 1) };
}

function streamFile(request: FastifyRequest, reply: FastifyReply, filePath: string, mediaDir: string): FastifyReply {
  const root = resolve(mediaDir);
  const target = resolve(filePath);
  if (target !== root && !target.startsWith(root + sep)) return reply.code(404).send({ error: 'Archivo no encontrado' });
  let size: number;
  let mtimeMs: number;
  try {
    const stats = statSync(target);
    if (!stats.isFile()) return reply.code(404).send({ error: 'Archivo no encontrado' });
    size = stats.size;
    mtimeMs = Math.round(stats.mtimeMs);
  } catch {
    return reply.code(404).send({ error: 'Archivo no encontrado' });
  }

  const etag = `W/"${size}-${mtimeMs}"`;
  reply
    .header('Accept-Ranges', 'bytes')
    .header('Content-Type', contentTypeFor(target))
    .header('Content-Disposition', 'inline')
    .header('ETag', etag)
    .header('Cache-Control', 'private, no-store');

  const ifNoneMatch = request.headers['if-none-match'];
  if (typeof ifNoneMatch === 'string' && (ifNoneMatch === etag || ifNoneMatch.split(',').includes(etag))) {
    return reply.code(304).send();
  }

  const range = parseRange(request.headers.range, size);
  if (range && range.start === -1) {
    // Cuerpo JSON como texto: la compresión global no sabe serializar el objeto
    // en una respuesta 416 y Fastify acabaría devolviendo un 500.
    return reply
      .code(416)
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Range', `bytes */${size}`)
      .send(JSON.stringify({ error: 'Rango no válido' }));
  }
  if (!range) {
    reply.header('Content-Length', size);
    if (request.method === 'HEAD') return sendHeadOnly(reply, 200);
    return reply.send(createReadStream(target));
  }
  reply.header('Content-Range', `bytes ${range.start}-${range.end}/${size}`).header('Content-Length', range.end - range.start + 1);
  if (request.method === 'HEAD') return sendHeadOnly(reply, 206);
  return reply.code(206).send(createReadStream(target, { start: range.start, end: range.end }));
}

/**
 * Un HEAD con `Content-Length` real no puede pasar por el serializador de
 * Fastify (calcularía el largo del cuerpo vacío y lo pondría a 0): se cierra la
 * respuesta a mano conservando todas las cabeceras ya fijadas.
 */
function sendHeadOnly(reply: FastifyReply, statusCode: number): FastifyReply {
  const headers = { ...reply.getHeaders() };
  const raw = reply.raw;
  reply.hijack();
  raw.writeHead(statusCode, Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, String(value)])));
  raw.end();
  return reply;
}

export async function registerMediaRoutes(app: FastifyInstance): Promise<void> {
  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = parseWith(idParamSchema, request.params);
    const row = findItemRow(app.db, id);
    if (!row) return reply.code(404).send({ error: 'Archivo no encontrado' });
    return streamFile(request, reply, resolve(app.appConfig.mediaDir, row.path), app.appConfig.mediaDir);
  };

  // Fastify expone el HEAD automáticamente (exposeHeadRoutes); no lo repetimos.
  app.get(
    '/api/stream/:id',
    {
      // Un 206 con `Content-Range` no debe comprimirse: rompería el rango.
      onSend: async (_request, reply) => {
        if (reply.getHeader('content-range') !== undefined) reply.header('x-no-compression', '1');
      },
    },
    handler,
  );
}
