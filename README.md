# MediaServer

![Version](https://img.shields.io/badge/version-2.0.0-9d6bff)
![License](https://img.shields.io/badge/license-MIT-9d6bff)
![Runtime](https://img.shields.io/badge/Node.js-22%2B-9d6bff)

Servidor multimedia privado para navegar y reproducir una biblioteca local de
audio y vídeo, pensado para usarse **desde el móvil** y desplegarse en un NAS o
un servidor casero con Docker.

La 2.0 es una reescritura de la interfaz y un endurecimiento del servidor. La
dirección visual está documentada en [DESIGN.md](DESIGN.md) y el contrato de la
API en [docs/API.md](docs/API.md).

## Qué cambia respecto a la 1.2.2

**Interfaz**

- Dirección visual nueva, *media-first*: la carátula es el interfaz y el chrome
  desaparece. Tema oscuro por defecto y **tema claro** opcional.
- **Responsive de verdad**: la disposición la decide CSS, no el `userAgent`. En
  móvil hay navegación inferior; en escritorio, barra lateral. Funciona igual en
  iPad, en una ventana estrecha o con «sitio de escritorio» activado.
- **Navegación con historial**: el gesto de volver de Android cierra el
  reproductor o vuelve del canal en lugar de salir de la aplicación, y cualquier
  vista se puede enlazar y compartir.
- **PWA instalable**: se añade a la pantalla de inicio, arranca sin barra de
  navegación y guarda la cáscara para abrir aunque el servidor tarde.
- **Mini reproductor persistente**: cerrar el reproductor ya no corta la
  reproducción; se sigue escuchando mientras navegas por la biblioteca.
- **Controles del sistema** (MediaSession): pantalla de bloqueo, auriculares y
  botones multimedia del sistema.
- **Seguir viendo** con barra de progreso, duración real y tiempo restante.
- **Cola de reproducción**: «Reproducir todo» en un canal, con siguiente y
  anterior, y cola lateral en escritorio.
- Carga progresiva al hacer scroll en lugar de paginación por flechas.
- Estados de carga, vacío y error con acción, en vez de pantallas en blanco.
- Acciones optimistas con aviso y opción de deshacer (favoritos, visto).
- Las preferencias (tema, tamaño de tarjetas, orden, autoplay) **se conservan**
  entre recargas.
- Accesibilidad: navegación por teclado, foco visible y atrapado en diálogos,
  nombres accesibles, objetivos táctiles de 44 px y respeto a
  `prefers-reduced-motion`.
- Tipografía auto-hospedada (nada de Google Fonts) y contraste pensado para
  lecturas largas.

**Servidor**

- **Duración real** de cada archivo (medida con `ffprobe`), antes siempre 0.
- **Carátulas de audio** de verdad: imagen embebida y, si no la hay, la portada
  de la carpeta. Antes no se generaba ninguna.
- **Escaneo incremental y cancelable**: sólo procesa lo nuevo o lo modificado.
- Los fotogramas de vista previa se generan **bajo demanda**, no durante el
  escaneo.
- Una sola tabla de estado (antes tres, sincronizadas a mano con SQL duplicado),
  con **migración automática** y copia de seguridad previa de la base de datos.
- Búsqueda, filtros, orden y paginación **en el servidor**.
- Endurecimiento: `/media/*` y las carátulas ya no son accesibles sin sesión,
  login con límite de intentos y comparación en tiempo constante, cabeceras de
  seguridad, validación con Zod de todos los parámetros, `/api/health` para el
  `HEALTHCHECK` y apagado ordenado.
- Las variables `MEDIA_PASSWORD` y `SESSION_SECRET` son obligatorias y **no
  tienen valor por defecto**.
- `.env` se carga de verdad (`--env-file-if-exists`), cosa que antes no ocurría.
- Tests unitarios y end-to-end reales (antes `pnpm test` estaba roto).

## Estructura de la biblioteca

```text
media/
  Videos/
    Openings/
      apertura-01.mp4
      cover.jpg          ← portada del canal (opcional)
  Audio/
    Canciones/
      cancion-01.mp3
      cover.jpg          ← portada de la carpeta (opcional)
```

- `media/<categoría>/<canal>/<archivo>` es la estructura normal.
- Un archivo directamente en `media/` se cataloga como `Sin Categoría / Sin Canal`.
- Un archivo dentro de una categoría pero no de un canal va a `<categoría> / Sin Canal`.
- Las subcarpetas de un canal se recorren de forma recursiva.
- La biblioteca es de **sólo lectura** para la aplicación.

Para las carátulas de audio se busca, por orden: imagen embebida en el archivo,
`cover|folder|front|album|poster.<ext>` en su carpeta, una imagen hermana con el
mismo nombre base, y la portada del canal.

## Requisitos

- Node.js 22 o superior
- pnpm
- FFmpeg (`ffmpeg` y `ffprobe` en el `PATH`) para duración y carátulas
- Docker / Docker Compose (opcional, para el despliegue)

## Instalación local

```bash
pnpm install
cp .env.example .env      # y edita las credenciales
pnpm dev
```

La aplicación queda en <http://localhost:3000>.

> `pnpm dev` levanta dos procesos: el servidor Fastify (puerto 3000) y Vite con
> recambio en caliente (puerto 5173). Usa el de Vite mientras desarrollas.

## Variables de entorno

| Variable | Obligatoria | Por defecto | Para qué |
| --- | --- | --- | --- |
| `MEDIA_PASSWORD` | **Sí** | — | Contraseña del único usuario |
| `SESSION_SECRET` | **Sí** | — | Firma la cookie de sesión (32+ caracteres) |
| `MEDIA_USER` | No | `media` | Nombre de usuario |
| `PORT` | No | `3000` | Puerto de escucha |
| `HOST` | No | `0.0.0.0` | Interfaz de escucha |
| `MEDIA_DIR` | No | `/media` si existe, si no `./media` | Biblioteca |
| `DATA_DIR` | No | `/data` si existe, si no `./data` | Base de datos y carátulas |
| `TRUST_PROXY` | No | `0` | `1` si va detrás de un proxy con HTTPS |
| `SCAN_CONCURRENCY` | No | `2` | Archivos procesados a la vez en el escaneo |
| `LOG_LEVEL` | No | `info` | `debug` sólo si lo necesitas |

Genera los secretos así:

```bash
openssl rand -base64 32   # SESSION_SECRET
```

`.env` se carga automáticamente al arrancar (`--env-file-if-exists`).

## Despliegue con Docker

```bash
mkdir -p media data
cp .env.example .env    # rellena MEDIA_PASSWORD y SESSION_SECRET
docker compose up -d --build
```

El contenedor monta `./media` en `/media` (sólo lectura) y `./data` en `/data`, y
publica el puerto 3000. Trae `HEALTHCHECK`, así que Portainer y `docker ps`
muestran el estado real del servicio.

### Con Portainer y una imagen ya construida

Si prefieres no construirlo en el NAS, guarda la imagen en un fichero y súbela:

```bash
docker build --provenance=false -t pazus-mediaserver:2.0.0 .
docker save -o pazus-mediaserver-2.0.0.tar pazus-mediaserver:2.0.0
```

El `--provenance=false` evita las atestaciones de BuildKit, que dan problemas al
importar en Docker antiguos.

1. Portainer → **Images** → *Import* → selecciona el `.tar`.
2. En tu stack, cambia la imagen a `pazus-mediaserver:2.0.0` y actualiza.

En [deploy/portainer-stack.yml](deploy/portainer-stack.yml) hay una plantilla del
stack sólo con la imagen (sin `build:`), con el healthcheck y las variables.

> Para volver atrás basta con devolver la etiqueta anterior en el stack: la
> imagen vieja sigue en el NAS.

**Al actualizar desde la 1.2.2**, el servidor migra la base de datos al
arrancar y guarda una copia `mediaserver.db.bak-<fecha>` en `DATA_DIR` antes de
tocarla. Aun así, conviene copiar `data/` antes del primer arranque.

## Uso

- **Inicio**: «Seguir viendo», lo añadido recientemente y las categorías.
- **Biblioteca**: categoría → canal → archivos. Filtros por visto, por ver y
  favoritos, y orden por nombre, fecha, duración o última reproducción.
- **Buscar**: búsqueda global que ignora mayúsculas y acentos. La consulta queda
  en la URL, así que se puede compartir.
- **Reproductor**: se abre a pantalla completa; al cerrarlo queda el mini
  reproductor. «Reproducir todo» encola el canal entero. Si el archivo ya estaba
  empezado, se ofrece continuar donde lo dejaste.
- **Ajustes**: tema, tamaño de las tarjetas, autoplay, estado de la biblioteca y
  reinicio del estado de reproducción (con confirmación).

### En el móvil (instalar como aplicación)

En Android, el navegador **sólo ofrece «Instalar app» si el sitio llega por
HTTPS**. Por HTTP en una IP de LAN no lo ofrece (en PC no se nota porque
`localhost` ya cuenta como contexto seguro). Por eso el servidor puede servir
HTTPS además de HTTP.

Pasos:

1. Genera un certificado local (una vez):

   ```bash
   # mkcert es lo más cómodo: sudo pacman -S mkcert
   scripts/gen-certs.sh 192.168.50.3
   ```

   Esto crea `certs/server.pem`, `certs/server-key.pem` y una autoridad de
   certificación (`rootCA.pem`).

2. Instala esa CA en el móvil: copia `rootCA.pem` al teléfono y en Android ve a
   **Ajustes → Seguridad → Instalar certificado → Certificado de CA**.

3. Arranca el servidor con HTTPS (`.env` o variables del contenedor):

   ```env
   TLS_CERT=/certs/server.pem
   TLS_KEY=/certs/server-key.pem
   TLS_PORT=3443
   ```

   Y expón el puerto `3443` (el `docker-compose.yml` y el stack de Portainer ya
   lo traen preparado).

4. Abre `https://192.168.50.3:3443` en el móvil y usa «Instalar app» /
   «Añadir a pantalla de inicio». La app queda como PWA, sin barra de navegación
   y respetando el notch y los gestos del sistema.

Sin HTTPS, en el móvil sólo tendrás un acceso directo que abre el navegador (no
una aplicación independiente).

## Arquitectura

```text
server/                 API Fastify
  config.ts             variables de entorno validadas
  db/                   esquema, migraciones y copia previa
  repositories/         consultas SQL tipadas
  routes/               endpoints agrupados por área
  services/             escaneo, ffprobe, carátulas, ejecución de ffmpeg
src/                    interfaz React
  App.tsx               composición de proveedores y rutas
  components/           piezas reutilizables (tarjetas, hojas, reproductor…)
  data/                 consultas, estado compartido y preferencias
  lib/                  cliente de la API, formato, hooks, iconos
  routes/               una vista por ruta
  styles/               tokens, base y estilos de la aplicación
tests/                  unitarios (Vitest) y end-to-end (Playwright)
public/                 manifiesto PWA, service worker, iconos
docs/                   contrato de la API y capturas
```

Decisiones que conviene conocer antes de tocar el código:

- La **versión vive sólo en `package.json`**; Vite la inyecta en el bundle y el
  servidor la lee de ahí.
- El reproductor es **una única instancia** montada en la raíz. No se desmonta al
  navegar: por eso la reproducción no se corta. Los cambios de presentación se
  hacen por CSS con `data-mode`.
- La disposición **no depende del user-agent** en ningún sitio.
- Las imágenes se sirven siempre por `/api/...` y exigen sesión.
- Los fotogramas de vista previa se generan la primera vez que se piden.

## Persistencia

Todo lo persistente vive en `DATA_DIR`:

```text
data/
  mediaserver.db        base SQLite (WAL)
  mediaserver.db.bak-*  copia previa a una migración
  covers/               carátulas y vistas previas generadas
```

Al migrar una base de una versión anterior se guarda una copia con marca de
tiempo antes de tocar nada. Aun así, **haz copias de seguridad de `data/`**.

## Desarrollo

Los guiones usan `pnpm` (el proyecto trae `packageManager: pnpm@10`):

```bash
pnpm dev          # servidor + Vite con recambio en caliente
pnpm build        # comprobación de tipos + build de producción
pnpm start        # servidor sobre dist/ ya construido
pnpm typecheck    # sólo tipos
pnpm test         # tests unitarios (Vitest)
pnpm test:e2e     # build + tests end-to-end (Playwright)
pnpm lint         # Biome (lint + formato)
pnpm icons        # regenera los PNG de la PWA desde los SVG
```

Antes de dar algo por terminado: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.

### Si no tienes pnpm instalado

Los guiones son atajos; con Node 22+ se puede hacer lo mismo a pelo. `node` hace
de lanzador y `--env-file-if-exists` sustituye a la carga del `.env`:

```bash
node --env-file-if-exists=.env --import tsx server/index.ts   # equivalente a pnpm start
./node_modules/.bin/vite build                                # equivalente a pnpm build (tras tsc)
./node_modules/.bin/vitest run                                # equivalente a pnpm test
```

Para levantar un servidor de prueba **sin tocar tu base de datos**, apunta
`DATA_DIR` a una copia (el shell pisa lo que diga el `.env`):

```bash
cp -a data .tmp/local-data
DATA_DIR="$PWD/.tmp/local-data" node --env-file-if-exists=.env --import tsx server/index.ts
```

### Tests end-to-end

Generan su propia biblioteca diminuta en `.tmp/e2e/` (nunca tocan tu `media/` ni
tu `data/`) y arrancan el servidor en el puerto 3210 con credenciales de prueba.
La primera vez hay que descargar el navegador:

```bash
pnpm exec playwright install chromium
```

Las capturas de la interfaz para revisar cambios visuales se regeneran solas en
[docs/capturas](docs/capturas) al ejecutar `pnpm test:e2e`.

## Seguridad

- Toda la API salvo `/api/health` y el acceso exige sesión.
- Los archivos de la biblioteca se sirven por `GET /api/stream/:id`, autenticado
  y con soporte de `Range`.
- El login limita los intentos fallidos y compara la contraseña en tiempo
  constante.
- Hay cabeceras de seguridad (CSP, `nosniff`, `Referrer-Policy`, etc.).
- **No se sirve HTTPS**: si lo expones fuera de tu red, ponlo detrás de un proxy
  con TLS y activa `TRUST_PROXY=1`.

## Licencia

MIT. Consulta [LICENSE](LICENSE).
