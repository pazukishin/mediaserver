import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Database from 'better-sqlite3';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync, createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative, extname, basename, resolve } from 'node:path';
import { runCommandWithTimeout } from './ffmpeg-runner.js';

const APP_VERSION = '1.2.1';
const port = Number(process.env.PORT ?? 3000);
const defaultMediaDir = existsSync('/media') && statSync('/media').isDirectory() ? '/media' : resolve(process.cwd(), 'media');
const defaultDataDir = existsSync('/data') && statSync('/data').isDirectory() ? '/data' : resolve(process.cwd(), 'data');
const mediaDir = resolve(process.env.MEDIA_DIR ?? defaultMediaDir);
const dataDir = resolve(process.env.DATA_DIR ?? defaultDataDir);
const user = process.env.MEDIA_USER ?? 'media';
const password = process.env.MEDIA_PASSWORD ?? 'cambia-esta-contrasena';
const coverDir = join(dataDir, 'covers');
mkdirSync(dataDir, { recursive: true });
mkdirSync(mediaDir, { recursive: true });
mkdirSync(coverDir, { recursive: true });
const db = new Database(join(dataDir, 'mediaserver.db'));
db.exec(`CREATE TABLE IF NOT EXISTS media_items (id INTEGER PRIMARY KEY, path TEXT UNIQUE, category TEXT, channel TEXT, kind TEXT, title TEXT, duration REAL DEFAULT 0, cover TEXT, created_at TEXT, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS playback_state (item_id INTEGER PRIMARY KEY, position REAL DEFAULT 0, watched INTEGER DEFAULT 0, favorite INTEGER DEFAULT 0, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS playback_history (path TEXT PRIMARY KEY, position REAL DEFAULT 0, watched INTEGER DEFAULT 0, favorite INTEGER DEFAULT 0, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS playback_by_path (path TEXT PRIMARY KEY, position REAL DEFAULT 0, watched INTEGER DEFAULT 0, favorite INTEGER DEFAULT 0, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);`);
try { db.exec('ALTER TABLE media_items ADD COLUMN created_at TEXT'); } catch { }
for (const table of ['playback_state', 'playback_by_path', 'playback_history']) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN favorite INTEGER DEFAULT 0`); } catch { }
}
db.exec('INSERT INTO playback_by_path (path, position, watched, favorite, updated_at) SELECT m.path, p.position, p.watched, COALESCE(p.favorite, 0), p.updated_at FROM media_items m JOIN playback_state p ON p.item_id = m.id WHERE 1=1 ON CONFLICT(path) DO UPDATE SET position=excluded.position, watched=excluded.watched, favorite=excluded.favorite, updated_at=excluded.updated_at');
db.exec('INSERT INTO playback_by_path (path, position, watched, favorite, updated_at) SELECT path, position, watched, COALESCE(favorite, 0), updated_at FROM playback_history WHERE 1=1 ON CONFLICT(path) DO UPDATE SET position=excluded.position, watched=excluded.watched, favorite=excluded.favorite, updated_at=excluded.updated_at');
const videoExtensions = new Set(['.mp4', '.webm', '.mkv', '.avi', '.mov']);
const audioExtensions = new Set(['.mp3', '.flac', '.ogg', '.opus', '.wav', '.m4a', '.aac']);
const mediaTypes: Record<string, string> = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.opus': 'audio/opus', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac' };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();

type Item = { id: number; path: string; category: string; channel: string; kind: string; title: string; duration: number; cover: string | null; watched: boolean; favorite: boolean; position: number; channelCover?: string | null; previews?: string[] };
type ScannedItem = Omit<Item, 'id' | 'watched' | 'favorite' | 'position'> & { created_at: string; updated_at: string };
type ScanStatus = { running: boolean; processed: number; currentFile: string; message: string; startedAt: string | null; total: number; };
const scanStatus: ScanStatus = { running: false, processed: 0, currentFile: '', message: 'Sin escaneo activo', startedAt: null, total: 0 };
let scanQueue: Promise<void> | null = null;
function resolveChannelCoverUrl(category: string, channel: string): string | null {
  const candidates = ['cover.png', 'cover.jpg', 'cover.jpeg'];
  for (const fileName of candidates) {
    const fullPath = resolve(mediaDir, category, channel, fileName);
    if (existsSync(fullPath) && statSync(fullPath).isFile()) {
      return `/media/${relative(mediaDir, fullPath).replaceAll('\\', '/')}`;
    }
  }
  return null;
}
async function createCover(source: string, kind: string, relativePath: string) {
  const extension = '.jpg';
  const output = join(coverDir, `${hash(relativePath)}${extension}`);
  const cacheUrl = `/cache/covers/${hash(relativePath)}${extension}`;
  if (existsSync(output)) return cacheUrl;
  app.log.info({ relativePath, source, output, kind }, 'Generando miniatura');
  const argumentsList = kind === 'video'
    ? ['-y', '-ss', '00:00:05', '-i', source, '-frames:v', '1', '-vf', 'scale=640:-2', output]
    : ['-y', '-i', source, '-an', '-c:v', 'copy', '-frames:v', '1', output];
  try {
    await runCommandWithTimeout('ffmpeg', argumentsList, 15000);
  } catch (error) {
    app.log.warn({ relativePath, error }, 'Miniatura fallida por timeout o error');
    return null;
  }
  if (existsSync(output)) {
    app.log.info({ relativePath, output }, 'Miniatura generada');
    return cacheUrl;
  }
  return null;
}
function existingPreviewUrls(relativePath: string, count = 5): string[] {
  const previewBase = `${hash(relativePath)}-preview`;
  return Array.from({ length: count }, (_, index) => {
    const file = join(coverDir, `${previewBase}-${index}.jpg`);
    const url = `/cache/covers/${previewBase}-${index}.jpg`;
    return existsSync(file) ? url : null;
  }).filter((value): value is string => Boolean(value));
}

async function ensureVideoPreviews(source: string, relativePath: string, count = 5): Promise<string[]> {
  const existing = existingPreviewUrls(relativePath, count);
  if (existing.length >= count) return existing;

  const ffprobe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', source], { encoding: 'utf8' });
  const duration = Number.parseFloat(ffprobe.stdout.trim() || '0');
  const times = Array.from({ length: count }, (_, index) => {
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    const ratio = (index + 1) / (count + 1);
    return Math.max(0.5, duration * ratio);
  });

  for (let index = 0; index < count; index += 1) {
    const output = join(coverDir, `${hash(relativePath)}-preview-${index}.jpg`);
    if (existsSync(output)) continue;
    const time = times[index];
    try {
      await runCommandWithTimeout('ffmpeg', ['-y', '-ss', String(time), '-i', source, '-frames:v', '1', '-vf', 'scale=640:-2', output], 10000);
    } catch (error) {
      app.log.warn({ relativePath, index, time, error }, 'Preview fallida por timeout o error');
      continue;
    }
    if (existsSync(output)) {
      existing.push(`/cache/covers/${hash(relativePath)}-preview-${index}.jpg`);
    }
  }

  return existing.slice(0, count);
}
async function countMediaFiles(folder: string): Promise<number> {
  let total = 0;
  const entries = await readdir(folder, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(folder, entry.name);
    if (entry.isDirectory()) total += await countMediaFiles(full);
    else {
      const extension = extname(full).toLowerCase();
      if (videoExtensions.has(extension) || audioExtensions.has(extension)) total += 1;
    }
  }
  return total;
}

async function scan() {
  const startedAt = Date.now();
  scanStatus.running = true;
  scanStatus.processed = 0;
  scanStatus.currentFile = '';
  scanStatus.message = 'Iniciando escaneo de la biblioteca';
  scanStatus.startedAt = new Date().toISOString();
  scanStatus.total = await countMediaFiles(mediaDir);
  app.log.info({ mediaDir, dataDir, totalFiles: scanStatus.total }, 'Iniciando escaneo de la biblioteca');
  const entries: ScannedItem[] = [];
  const addFile = async (full: string, category: string, channel: string) => {
    const extension = extname(full).toLowerCase();
    const kind = videoExtensions.has(extension) ? 'video' : audioExtensions.has(extension) ? 'audio' : null;
    if (!kind) return;
    const relativePath = relative(mediaDir, full).replaceAll('\\', '/');
    const fileStats = await stat(full);
    const createdAt = fileStats.birthtimeMs > 0 ? fileStats.birthtime : fileStats.mtime;
    scanStatus.currentFile = relativePath;
    scanStatus.message = `Procesando ${relativePath}`;
    app.log.info({ category, channel, relativePath, kind }, 'Procesando archivo');
    const cover = await createCover(full, kind, relativePath);
    if (kind === 'video') await ensureVideoPreviews(full, relativePath, 5);
    entries.push({ path: relativePath, category, channel, kind, title: basename(full, extension), duration: 0, cover, created_at: createdAt.toISOString(), updated_at: now() });
    scanStatus.processed = entries.length;
    if (entries.length % 25 === 0) app.log.info({ processed: entries.length, total: scanStatus.total }, 'Escaneo en curso');
  };
  const walk = async (folder: string, category: string, channel: string) => {
    const entriesInFolder = await readdir(folder, { withFileTypes: true });
    for (const entry of entriesInFolder) {
      const full = join(folder, entry.name);
      if (entry.isDirectory()) await walk(full, category, channel);
      else await addFile(full, category, channel);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  const rootEntries = await readdir(mediaDir, { withFileTypes: true });
  for (const category of rootEntries) {
    if (category.isFile()) {
      await addFile(join(mediaDir, category.name), 'Sin Categoría', 'Sin Canal');
      continue;
    }
    const channelEntries = await readdir(join(mediaDir, category.name), { withFileTypes: true });
    for (const channel of channelEntries) {
      if (channel.isFile()) await addFile(join(mediaDir, category.name, channel.name), category.name, 'Sin Canal');
      else await walk(join(mediaDir, category.name, channel.name), category.name, channel.name);
    }
  }
  const upsert = db.prepare('INSERT INTO media_items (path, category, channel, kind, title, duration, cover, created_at, updated_at) VALUES (@path,@category,@channel,@kind,@title,@duration,@cover,@created_at,@updated_at) ON CONFLICT(path) DO UPDATE SET category=@category, channel=@channel, kind=@kind, title=@title, cover=@cover, created_at=@created_at, updated_at=@updated_at');
  const saveHistory = db.prepare('INSERT INTO playback_history (path, position, watched, updated_at) SELECT m.path, p.position, p.watched, p.updated_at FROM media_items m JOIN playback_state p ON p.item_id = m.id WHERE 1=1 ON CONFLICT(path) DO UPDATE SET position=excluded.position, watched=excluded.watched, updated_at=excluded.updated_at');
  const restoreHistory = db.prepare('INSERT INTO playback_state (item_id, position, watched, updated_at) SELECT m.id, h.position, h.watched, h.updated_at FROM media_items m JOIN playback_history h ON h.path = m.path WHERE NOT EXISTS (SELECT 1 FROM playback_state p WHERE p.item_id = m.id)');
  const removeMissing = db.prepare('DELETE FROM media_items WHERE path NOT IN (' + (entries.length ? entries.map(() => '?').join(',') : "''") + ')');
  let removed = 0;
  const transaction = db.transaction(() => {
    saveHistory.run();
    entries.forEach((entry) => upsert.run(entry));
    removed = removeMissing.run(...entries.map((entry) => entry.path)).changes;
    restoreHistory.run();
  });
  transaction();
  scanStatus.running = false;
  scanStatus.processed = entries.length;
  scanStatus.currentFile = '';
  scanStatus.message = `Escaneo completado: ${entries.length} archivos procesados`;
  scanStatus.total = entries.length;
  app.log.info({ total: entries.length, removed, durationMs: Date.now() - startedAt }, 'Escaneo completado');
  scanQueue = null;
  return entries.length;
}
function requireAuth(request: { cookies: Record<string, string | undefined> }, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) {
  const token = request.cookies.session;
  const session = token && db.prepare('SELECT token_hash FROM sessions WHERE token_hash = ? AND expires_at > ?').get(hash(token), Date.now());
  if (!session) return reply.code(401).send({ error: 'No autorizado' });
}
const app = Fastify({ logger: { level: 'debug' } });
await app.register(cookie, { secret: process.env.SESSION_SECRET ?? 'dev-secret' });
app.get('/api/session', async (request) => ({ authenticated: Boolean(request.cookies.session && db.prepare('SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ?').get(hash(request.cookies.session), Date.now())) }));
app.post('/api/login', async (request, reply) => { const body = request.body as { username?: string; password?: string }; if (body.username !== user || body.password !== password) return reply.code(401).send({ error: 'Credenciales no válidas' }); const token = randomBytes(32).toString('hex'); db.prepare('INSERT INTO sessions VALUES (?, ?)').run(hash(token), Date.now() + 1000 * 60 * 60 * 24 * 30); reply.setCookie('session', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 }); return { authenticated: true }; });
app.post('/api/logout', async (request, reply) => { if (request.cookies.session) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(request.cookies.session)); reply.clearCookie('session', { path: '/' }); return { ok: true }; });
app.get('/api/library', async (request, reply) => { if (requireAuth(request, reply)) return; const query = request.query as { watched?: string; category?: string; channel?: string }; const rows = db.prepare(`SELECT m.*, COALESCE(p.watched, 0) watched, COALESCE(p.favorite, 0) favorite, COALESCE(p.position, 0) position, p.updated_at watched_at FROM media_items m LEFT JOIN playback_by_path p ON p.path = m.path WHERE (? = '' OR m.category = ?) AND (? = '' OR m.channel = ?) AND (? = 'all' OR watched = ?) ORDER BY m.category, m.channel, m.title`).all(query.category ?? '', query.category ?? '', query.channel ?? '', query.channel ?? '', query.watched ?? 'all', query.watched === 'watched' ? 1 : 0) as Array<Omit<Item, 'watched' | 'favorite'> & { watched: number; favorite: number; watched_at: string | null; created_at: string | null }>;
  return rows.map((item) => {
    const channelCover = resolveChannelCoverUrl(item.category, item.channel);
    const previews = item.kind === 'video' ? existingPreviewUrls(item.path, 5) : [];
    return { ...item, watched: Boolean(item.watched), favorite: Boolean(item.favorite), extension: extname(item.path).toLowerCase(), url: `/api/stream/${item.id}`, channelCover, previews };
  }); });
app.get('/api/scan/status', async (request, reply) => { if (requireAuth(request, reply)) return; return scanStatus; });
app.post('/api/scan', async (request, reply) => { if (requireAuth(request, reply)) return; if (scanQueue) return reply.code(409).send({ error: 'Ya hay un escaneo en curso' });
  scanStatus.running = true;
  scanStatus.processed = 0;
  scanStatus.currentFile = '';
  scanStatus.message = 'Iniciando escaneo de la biblioteca';
  scanStatus.startedAt = new Date().toISOString();
  scanStatus.total = 0;
  scanQueue = (async () => {
    try {
      await scan();
    } catch (error) {
      scanStatus.running = false;
      scanStatus.currentFile = '';
      scanStatus.message = error instanceof Error ? error.message : 'Error al escanear la biblioteca';
      app.log.error({ err: error }, 'Escaneo fallido');
    } finally {
      scanQueue = null;
    }
  })();
  return { accepted: true, startedAt: scanStatus.startedAt };
});
app.get('/api/items/:id/progress', async (request, reply) => { if (requireAuth(request, reply)) return; const id = Number((request.params as { id: string }).id); const item = db.prepare('SELECT path FROM media_items WHERE id = ?').get(id) as { path: string } | undefined; if (!item) return reply.code(404).send({ error: 'Archivo no encontrado' }); const state = db.prepare('SELECT position FROM playback_by_path WHERE path = ?').get(item.path) as { position: number } | undefined; return { position: state?.position ?? 0 }; });
app.post('/api/items/:id/progress', async (request, reply) => { if (requireAuth(request, reply)) return; const id = Number((request.params as { id: string }).id); const body = request.body as { position: number }; const updatedAt = now(); const item = db.prepare('SELECT path FROM media_items WHERE id = ?').get(id) as { path: string } | undefined; const current = item ? db.prepare('SELECT watched, favorite FROM playback_by_path WHERE path = ?').get(item.path) as { watched: number; favorite: number } | undefined : undefined; const watched = current?.watched ?? 0; const favorite = current?.favorite ?? 0; db.prepare('INSERT INTO playback_state (item_id, position, watched, favorite, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(item_id) DO UPDATE SET position=?, watched=?, favorite=?, updated_at=?').run(id, body.position, watched, favorite, updatedAt, body.position, watched, favorite, updatedAt); if (item) { db.prepare('INSERT INTO playback_by_path (path, position, watched, favorite, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET position=excluded.position, watched=excluded.watched, favorite=excluded.favorite, updated_at=excluded.updated_at').run(item.path, body.position, watched, favorite, updatedAt); db.prepare('INSERT INTO playback_history (path, position, watched, favorite, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET position=excluded.position, watched=excluded.watched, favorite=excluded.favorite, updated_at=excluded.updated_at').run(item.path, body.position, watched, favorite, updatedAt); } return { ok: true }; });
app.post('/api/items/:id/watched', async (request, reply) => { if (requireAuth(request, reply)) return; const id = Number((request.params as { id: string }).id); const body = request.body as { watched: boolean }; const updatedAt = now(); const watched = body.watched ? 1 : 0; const item = db.prepare('SELECT path FROM media_items WHERE id = ?').get(id) as { path: string } | undefined; const current = item ? db.prepare('SELECT position, favorite FROM playback_by_path WHERE path = ?').get(item.path) as { position: number; favorite: number } | undefined : undefined; const favorite = current?.favorite ?? 0; db.prepare('INSERT INTO playback_state (item_id, position, watched, favorite, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(item_id) DO UPDATE SET position=?, watched=?, favorite=?, updated_at=?').run(id, current?.position ?? 0, watched, favorite, updatedAt, current?.position ?? 0, watched, favorite, updatedAt); if (item) { db.prepare('INSERT INTO playback_by_path (path, position, watched, favorite, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET watched=excluded.watched, favorite=excluded.favorite, updated_at=excluded.updated_at').run(item.path, current?.position ?? 0, watched, favorite, updatedAt); db.prepare('INSERT INTO playback_history (path, position, watched, favorite, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET watched=excluded.watched, favorite=excluded.favorite, updated_at=excluded.updated_at').run(item.path, current?.position ?? 0, watched, favorite, updatedAt); } return { watched: body.watched }; });
app.post('/api/items/:id/favorite', async (request, reply) => { if (requireAuth(request, reply)) return; const id = Number((request.params as { id: string }).id); const body = request.body as { favorite: boolean }; const updatedAt = now(); const favorite = body.favorite ? 1 : 0; const item = db.prepare('SELECT path FROM media_items WHERE id = ?').get(id) as { path: string } | undefined; const current = item ? db.prepare('SELECT position, watched FROM playback_by_path WHERE path = ?').get(item.path) as { position: number; watched: number } | undefined : undefined; db.prepare('INSERT INTO playback_state (item_id, position, watched, favorite, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(item_id) DO UPDATE SET position=?, watched=?, favorite=?, updated_at=?').run(id, current?.position ?? 0, current?.watched ?? 0, favorite, updatedAt, current?.position ?? 0, current?.watched ?? 0, favorite, updatedAt); if (item) { db.prepare('INSERT INTO playback_by_path (path, position, watched, favorite, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET favorite=excluded.favorite, updated_at=excluded.updated_at').run(item.path, current?.position ?? 0, current?.watched ?? 0, favorite, updatedAt); db.prepare('INSERT INTO playback_history (path, position, watched, favorite, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET favorite=excluded.favorite, updated_at=excluded.updated_at').run(item.path, current?.position ?? 0, current?.watched ?? 0, favorite, updatedAt); } return { favorite: body.favorite }; });
app.post('/api/reset', async (request, reply) => { if (requireAuth(request, reply)) return; db.prepare('DELETE FROM playback_state').run(); return { ok: true }; });
const streamFile = (request: { headers: { range?: string } }, reply: any, filePath: string) => {
  if (!filePath.startsWith(resolve(mediaDir) + '/') || !existsSync(filePath) || !statSync(filePath).isFile()) return reply.code(404).send({ error: 'Archivo no encontrado' });
  const fileSize = statSync(filePath).size;
  const contentType = mediaTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const range = request.headers.range;
  reply.header('Accept-Ranges', 'bytes').header('Content-Type', contentType).header('Content-Disposition', 'inline');
  if (!range) return reply.header('Content-Length', fileSize).send(createReadStream(filePath));
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return reply.code(416).header('Content-Range', `bytes */${fileSize}`).send();
  const start = match[1] ? Number(match[1]) : Math.max(fileSize - Number(match[2]), 0);
  const end = match[2] ? Number(match[2]) : fileSize - 1;
  if (start > end || start >= fileSize) return reply.code(416).header('Content-Range', `bytes */${fileSize}`).send();
  reply.code(206).header('Content-Range', `bytes ${start}-${end}/${fileSize}`).header('Content-Length', end - start + 1);
  return reply.send(createReadStream(filePath, { start, end }));
};
app.get('/api/stream/:id', async (request, reply) => {
  if (requireAuth(request, reply)) return;
  const item = db.prepare('SELECT path FROM media_items WHERE id = ?').get(Number((request.params as { id: string }).id)) as { path: string } | undefined;
  if (!item) return reply.code(404).send({ error: 'Archivo no encontrado' });
  return streamFile(request, reply, resolve(mediaDir, item.path));
});
app.get('/media/*', async (request, reply) => {
  const relativePath = (request.params as { '*': string })['*'];
  return streamFile(request, reply, resolve(mediaDir, relativePath));
});
const staticRoot = resolve(process.cwd(), 'dist');
const cacheRoot = resolve(dataDir);
app.register(fastifyStatic, { root: staticRoot, prefix: '/' });
app.register(fastifyStatic, { root: cacheRoot, prefix: '/cache/', decorateReply: false });
app.listen({ port, host: '0.0.0.0' }).then(() => {
  const ffmpegCheck = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  app.log.info({
    app: 'MediaServer',
    version: APP_VERSION,
    nodeVersion: process.version,
    port,
    mediaDir,
    dataDir,
    cwd: process.cwd(),
    mediaUser: user,
    ffmpegAvailable: ffmpegCheck.status === 0,
    staticRoot: resolve(process.cwd(), 'dist'),
    cacheRoot: dataDir,
    status: 'listening',
  }, 'MediaServer arrancado');
  app.log.info({
    message: 'Sin escaneo automático al iniciar. Usa el botón Escanear para iniciar un análisis manual.',
  }, 'Configuración de arranque');
});
