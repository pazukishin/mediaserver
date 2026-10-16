# Contrato de API — MediaServer 2.0

Fuente de verdad entre `server/` y `src/`. Si el servidor devuelve algo distinto
de lo que dice este documento, el servidor está mal.

Convenciones generales:

- Todo es **JSON** salvo el streaming y las imágenes.
- Errores: siempre `{ "error": "mensaje en español, para el usuario" }` con el
  código HTTP adecuado (`400` validación, `401` sin sesión, `404`, `409`, `429`).
- Fechas: ISO 8601 en UTC (`new Date().toISOString()`).
- Toda ruta bajo `/api/` **exige sesión válida** salvo `GET /api/health` y
  `POST /api/auth/login`.
- Los parámetros se validan con Zod. Un parámetro inválido da `400`, nunca una
  excepción sin capturar.

## DTO `Item`

```ts
type Item = {
  id: number;
  title: string;
  kind: 'audio' | 'video';
  category: string;
  channel: string;
  extension: string;          // '.mp4', '.mp3', ...
  duration: number;           // segundos; 0 si no se pudo determinar
  position: number;           // segundos reproducidos
  progress: number;           // 0..1, calculado en el servidor
  watched: boolean;
  favorite: boolean;
  createdAt: string | null;   // fecha del fichero (birthtime si existe)
  addedAt: string | null;     // cuándo lo vio el escáner por primera vez
  watchedAt: string | null;
  favoriteAt: string | null;
  sizeBytes: number | null;
  streamUrl: string;          // `/api/stream/{id}`
  artworkUrl: string | null;  // `/api/items/{id}/artwork`, null si no hay
  previewUrl: string | null;  // `/api/items/{id}/artwork/preview`
};
```

## DTO de resumen

```ts
type CategorySummary = {
  name: string;
  items: number; watched: number; favorites: number;
  duration: number;                  // suma de duraciones
  artworkUrl: string | null;         // carátula del canal más reciente
  latestAt: string | null;
};

type ChannelSummary = CategorySummary & { category: string };

type ScanStatus = {
  running: boolean;
  processed: number; total: number;
  currentFile: string;
  message: string;                   // texto en español listo para mostrar
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  added: number; updated: number; removed: number;
};
```

## Endpoints

### Diagnóstico y sesión

| Método | Ruta | Respuesta |
| --- | --- | --- |
| `GET` | `/api/health` | `{ ok: true, version, uptimeSec, items, ffmpeg: boolean, media: { dir, readable }, scan: { running } }` — **sin sesión**, pensado para el `HEALTHCHECK` de Docker |
| `GET` | `/api/session` | `{ authenticated: boolean, version }` |
| `POST` | `/api/auth/login` | body `{ username, password }` → `{ ok: true }`; `401` si falla; `429` tras 5 intentos fallidos por IP en 15 min |
| `POST` | `/api/auth/logout` | `{ ok: true }` |

La contraseña se compara en **tiempo constante** (`crypto.timingSafeEqual`) y
sólo se admiten credenciales por variables de entorno. La cookie `session` va
firmada (`signed: true`), `httpOnly`, `sameSite: 'lax'`, `path: '/'`,
`maxAge: 30 días` y `secure: true` cuando `TRUST_PROXY=1`. Las sesiones
caducadas se purgan al validar.

### Navegación

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/home` | `{ continueWatching: Item[], recentlyAdded: Item[], categories: CategorySummary[], stats: { items, watched, favorites, duration } }` |
| `GET` | `/api/categories` | `{ categories: CategorySummary[] }` |
| `GET` | `/api/channels?category=` | `{ channels: ChannelSummary[] }` (`category` opcional) |
| `GET` | `/api/items` | listado filtrado y paginado, ver abajo |
| `GET` | `/api/items/:id` | `Item` |
| `GET` | `/api/items/:id/queue` | `{ ids: number[] }` — el canal del elemento, en el mismo orden que `/api/items`, para construir la cola |

`/api/items` admite:

| Parámetro | Valores | Por defecto |
| --- | --- | --- |
| `category` | texto exacto | — |
| `channel` | texto exacto | — |
| `q` | búsqueda por título, sin distinguir mayúsculas ni acentos | — |
| `filter` | `all` \| `unwatched` \| `watched` \| `favorite` \| `progress` | `all` |
| `sort` | `name` \| `created` \| `added` \| `duration` \| `watched` | `name` |
| `dir` | `asc` \| `desc` | `asc` |
| `offset` | entero ≥ 0 | `0` |
| `limit` | 1..500 | `100` |

Respuesta: `{ items: Item[], total: number, offset: number, limit: number }`.
`total` es el total **tras filtrar**, antes de paginar (para el scroll infinito).

`filter=progress` = `position > 30` y no visto y `progress < 0.95` (lo que
alimenta "Seguir viendo").

### Estado de reproducción

| Método | Ruta | Cuerpo | Respuesta |
| --- | --- | --- | --- |
| `POST` | `/api/items/:id/progress` | `{ position: number, duration?: number }` | `{ position, progress, watched }` |
| `POST` | `/api/items/:id/watched` | `{ watched: boolean }` | `{ watched, watchedAt, position }` |
| `POST` | `/api/items/:id/favorite` | `{ favorite: boolean }` | `{ favorite, favoriteAt }` |
| `POST` | `/api/state/reset` | `{ scope: 'progress' \| 'watched' \| 'favorite' \| 'all' }` | `{ ok: true, affected: number }` |

Reglas:

- `position` se acota a `[0, duration]` y se ignora si `duration === 0`.
- Al superar el 90 % de la duración se marca `watched = true` automáticamente y
  se pone `position = 0` (para que el siguiente visionado empiece del principio).
- Marcar como visto a mano también reinicia `position` a 0.
- `POST /api/state/reset` **debe afectar de verdad** a lo que se lee. En la
  versión anterior borraba `playback_state` mientras las lecturas iban a
  `playback_by_path`: era un no-op silencioso.

### Escaneo

| Método | Ruta | Respuesta |
| --- | --- | --- |
| `POST` | `/api/scan` | `{ accepted: true, startedAt }`; `409` si ya hay uno en curso |
| `GET` | `/api/scan/status` | `ScanStatus` |
| `POST` | `/api/scan/cancel` | `{ accepted: boolean }` |

El escaneo es **incremental**: sólo procesa ficheros nuevos o cuyo `mtime` o
tamaño hayan cambiado; los ausentes se eliminan del catálogo. Debe poder
cancelarse entre ficheros. No bloquea el bucle de eventos (procesa con `await`
y cede con `setImmediate`).

Metadatos por fichero (con `ffprobe`, si está disponible):

- `duration` (segundos), `width`/`height`.
- Carátula de **vídeo**: fotograma al 10 % de la duración (mínimo 1 s).
- Carátula de **audio**, por orden de preferencia: 1) imagen embebida
  (`-map 0:v:0`), 2) `cover|folder|front|album|poster` con cualquier extensión
  de imagen en la carpeta del fichero, 3) imagen hermana con el mismo nombre
  base, 4) `cover.jpg|png` de la carpeta del canal.
  **Nota**: el comando antiguo (`-an -c:v copy`) fallaba siempre; hay que
  reencodear a JPEG (`-c:v mjpeg -q:v 3` o equivalente).
- Las **previews** (5 fotogramas) **no** se generan durante el escaneo: se
  generan bajo demanda la primera vez que se piden y quedan cacheadas.

### Medios

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET`/`HEAD` | `/api/stream/:id` | Fichero con soporte `Range` (`206`), `Accept-Ranges`, `Content-Type` correcto, `ETag` y `304`. `Cache-Control: private, no-store` |
| `GET` | `/api/items/:id/artwork` | JPEG de carátula; `404` si no hay |
| `GET` | `/api/items/:id/artwork/preview?index=0..4` | JPEG generado bajo demanda; `404` si no se puede |
| `GET` | `/api/channels/artwork?category=&channel=` | JPEG de la carátula del canal |

Las imágenes se sirven con `Cache-Control: private, max-age=31536000, immutable`
(el cliente añade `?v=<hash>` cuando el fichero cambia).

**Rutas eliminadas**: `/media/*` y el estático `/cache/` desaparecen. En la
versión anterior `/media/*` no pedía autenticación y exponía la biblioteca
completa a cualquiera que estuviera en la red. Toda imagen pasa ahora por
`/api/...` con sesión.

## Persistencia

`DATA_DIR/mediaserver.db` (SQLite, `better-sqlite3`, WAL). Migraciones
versionadas en una tabla `schema_migrations`, aplicadas al arrancar, **con copia
de seguridad previa** del fichero (`mediaserver.db.bak-<ISO>` con marca de
tiempo) la primera vez que se migra una base existente.

```sql
CREATE TABLE media_items (
  id            INTEGER PRIMARY KEY,
  path          TEXT NOT NULL UNIQUE,       -- relativo a MEDIA_DIR, con '/'
  category      TEXT NOT NULL,
  channel       TEXT NOT NULL,
  kind          TEXT NOT NULL,              -- 'audio' | 'video'
  title         TEXT NOT NULL,
  extension     TEXT NOT NULL,
  duration      REAL NOT NULL DEFAULT 0,
  width         INTEGER,
  height        INTEGER,
  size_bytes    INTEGER,
  file_mtime    INTEGER,                    -- ms, para el escaneo incremental
  cover         TEXT,                       -- nombre de fichero en covers/
  created_at    TEXT,
  added_at      TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  scanned_at    TEXT
);

-- Una sola tabla de estado, con el path como clave: sobrevive a rescanes,
-- cambios de id y ficheros movidos dentro de la biblioteca.
CREATE TABLE playback_state (
  path        TEXT PRIMARY KEY,
  item_id     INTEGER,
  position    REAL NOT NULL DEFAULT 0,
  duration    REAL NOT NULL DEFAULT 0,
  watched     INTEGER NOT NULL DEFAULT 0,
  favorite    INTEGER NOT NULL DEFAULT 0,
  play_count  INTEGER NOT NULL DEFAULT 0,
  watched_at  TEXT,
  favorite_at TEXT,
  updated_at  TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);

CREATE TABLE scan_runs (
  id INTEGER PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  added INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  removed INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
```

**Migración desde la base actual (1.2.2)**: hay que conservar el estado de las
tres tablas antiguas (`playback_state`, `playback_by_path`, `playback_history`,
todas con columna `path` salvo la primera, que usa `item_id`). Se fusionan en la
nueva `playback_state` dando prioridad a la fila con `updated_at` más reciente.
Sin pérdida de vistos, favoritos ni posiciones.

## Configuración

| Variable | Por defecto | Notas |
| --- | --- | --- |
| `PORT` | `3000` | |
| `HOST` | `0.0.0.0` | |
| `MEDIA_DIR` | `/media` si existe, si no `./media` | sólo lectura |
| `DATA_DIR` | `/data` si existe, si no `./data` | |
| `MEDIA_USER` | `media` | |
| `MEDIA_PASSWORD` | — | **obligatoria**; sin valor por defecto. Si falta, el servidor no arranca y explica qué hacer |
| `SESSION_SECRET` | — | obligatoria (≥32 caracteres); firma la cookie |
| `TRUST_PROXY` | `0` | `1` activa `secure` en la cookie y `trustProxy` |
| `SCAN_CONCURRENCY` | `2` | ficheros procesados en paralelo |
| `LOG_LEVEL` | `info` | `debug` sólo si se pide |
| `TLS_CERT` / `TLS_KEY` | — | rutas al certificado y la clave para servir HTTPS (opcional; ambas o ninguna) |
| `TLS_PORT` | `3443` | puerto HTTPS (sólo se abre si hay certificado) |

`.env` se carga con `--env-file-if-exists=.env` (ya está en los scripts de
`package.json`). En la versión anterior el servidor leía `.env` sólo por
casualidad: nadie lo cargaba, así que la contraseña que documentaba el README se
ignoraba.

## Arranque y parada

- Log de arranque con versión, rutas, disponibilidad de ffmpeg y si hay base
  migrada.
- `SIGINT`/`SIGTERM`: cerrar el servidor, cerrar SQLite y salir con código 0.
- Sin escaneo automático al arrancar (se lanza a mano o desde el `HEALTHCHECK`
  externo), pero `GET /api/health` informa del estado.

## Criterios de aceptación del backend

1. `pnpm typecheck` y `pnpm test` pasan.
2. Existen tests de: autenticación (login correcto/incorrecto/rate limit),
   validación de parámetros, cálculo de `progress`, marcado automático al 90 %,
   `state/reset` afectando a las lecturas, paginación y filtros de `/api/items`,
   y migración de una base 1.2.2 con estado previo.
3. Ninguna ruta de medios responde sin sesión (`/api/stream/:id` y las de
   artwork devuelven `401`).
4. El escaneo de una biblioteca de prueba rellena `duration` y genera carátula
   para audio y vídeo.
5. Se puede cancelar un escaneo en curso.
