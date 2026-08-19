# MediaServer

![Version](https://img.shields.io/badge/version-1.2.2-7dce9b)
![License](https://img.shields.io/badge/license-MIT-7dce9b)
![Runtime](https://img.shields.io/badge/Node.js-24-7dce9b)

MediaServer es un servidor multimedia privado para gestionar, navegar, reproducir y marcar archivos de vídeo y audio desde una biblioteca local estructurada por categorías y canales. Está pensado para uso doméstico o de laboratorio, con una interfaz web moderna para explorar contenido, seguir el progreso de reproducción y trabajar de forma cómoda en escritorio y móvil.

Este proyecto se ha desarrollado íntegramente con GitHub Copilot como prueba de las capacidades del agente en tareas reales de construcción de software: arquitectura, frontend, backend, UX responsive, Docker, correcciones de regresión, optimización de rendimiento y despliegue.

> Proyecto personal y experimental. Revisa la configuración de seguridad antes de exponerlo a Internet.

## Características principales

- Exploración de contenido por categorías y canales
- Reproducción de vídeo y audio
- Marcado de archivos como vistos y favoritos
- Búsqueda y filtros por estado de reproducción
- Ordenación por nombre o fecha de creación
- Galería con paginación y compactación automática
- Miniaturas y previews de vídeo generadas con FFmpeg
- Reproductor con UI adaptada a móvil y escritorio
- Soporte para archivos `.opus` y audio/video comunes
- Autenticación simple por usuario y contraseña
- Persistencia de datos y progreso en SQLite
- Despliegue simplificado con Docker
- Logs a consola para integración con Portainer

## Estructura de la biblioteca

La estructura recomendada es:

```text
media/
  Anime/
    Accion/
      episodio-01.mp4
      episodio-02.mp4
  Documentales/
    Naturaleza/
      video.mp4
  Musica/
    Album/
      track-01.mp3
  Sin Categoría/
    archivo.mp4
```

Las rutas se interpretan así:

- `media/<categoria>/<canal>/<archivo>`
- Si un archivo está directamente dentro de `media`, se trata como `Sin Categoría` / `Sin Canal`
- Si un archivo está dentro de una categoría pero no de un canal, se agrupa como `<categoria>/Sin Canal`

## Requisitos

- Node.js 24+
- pnpm
- FFmpeg
- Docker / Docker Desktop (opcional, para despliegue con contenedores)

## Instalación local

1. Clona el repositorio.
2. Instala dependencias:

```bash
pnpm install
```

3. Crea y ajusta la configuración de entorno:

```bash
copy .env.example .env
```

En macOS/Linux puede usarse `cp .env.example .env`.

4. Inicia la aplicación en modo desarrollo:

```bash
pnpm dev
```

La app quedará disponible en:

```text
http://localhost:3000
```

## Variables de entorno

El proyecto usa varias variables opcionales para configurar rutas, acceso y sesión.

Ejemplo de `.env`:

```env
PORT=3000
MEDIA_DIR=/media
DATA_DIR=/data
MEDIA_USER=media
MEDIA_PASSWORD=cambia-esta-contrasena
SESSION_SECRET=dev-secret
```

Puedes partir de [.env.example](.env.example). Si no se establecen, la app usa por defecto:

- `media/` dentro del proyecto
- `data/` dentro del proyecto
- usuario: `media`
- contraseña: `cambia-esta-contrasena`

En Docker Compose, los volúmenes se montan en `/media` y `/data` dentro del contenedor. No cambies esas rutas sin actualizar también los montajes del archivo `docker-compose.yml`.

## Arranque con Docker

1. Crea las carpetas de contenido si no existen:

```bash
mkdir -p media data
```

2. Ajusta `.env` si quieres configurar usuario, contraseña y rutas.

3. Levanta el contenedor:

```bash
docker compose up -d --build
```

4. Abre la aplicación:

```text
http://localhost:3000
```

Para actualizar una instalación existente:

```bash
docker compose pull
docker compose up -d --build
```

Para consultar el estado y los logs:

```bash
docker compose ps
docker compose logs -f mediaserver
```

## Acceso y autenticación

La app usa una autenticación básica por sesión HTTP.

Credenciales por defecto:

- Usuario: `media`
- Contraseña: `cambia-esta-contrasena`

Es recomendable cambiarla en producción.

La sesión depende de `SESSION_SECRET`; utiliza una clave larga y aleatoria y no publiques el archivo `.env`.

## Escaneo y generación de contenido

El botón `Escanear` analiza la biblioteca y genera:

- metadatos de cada archivo
- miniaturas de portada
- previews animados para vídeos
- entradas en la base de datos SQLite
- actualización del catálogo sin perder el estado de vistos y favoritos

La lógica de escaneo está protegida para que no bloquee la aplicación durante tiempos prolongados, evitando que el servidor quede colgado por un archivo problemático o por tareas pesadas de FFmpeg.

El progreso de reproducción y el estado de cada elemento son conceptos separados:

- **Progreso de reproducción**: guarda la posición aproximada en la que se dejó un audio o vídeo para poder continuar desde ahí.
- **Visto/No visto**: es el estado manual o automático que indica si el contenido se ha completado. Un elemento marcado como `Visto` siempre empieza desde el principio y nunca restaura una posición anterior.
- **Favoritos**: es una marca independiente para encontrar rápidamente contenido guardado.

## Persistencia

Los datos persistentes viven en la carpeta `data`:

```text
data/
  mediaserver.db
  covers/
```

Esta carpeta contiene:

- la base de datos SQLite
- miniaturas y previews generados por FFmpeg
- cachés y archivos auxiliares de la app

La librería multimedia es de solo lectura para la app en tiempo de ejecución.

Haz copias de seguridad de `data/` para conservar la base de datos y las imágenes generadas. La carpeta `media/` contiene el contenido original y se monta como solo lectura en Docker.

## Rendimiento y UX

La interfaz ha sido optimizada para:

- escritorio con pantallas verticales
- móvil real con experiencia compacta
- uso táctil en teléfonos
- evitar bloqueos de la UI tras escaneos largos
- ocultar paneles y listas redundantes cuando el navegador real es móvil

## Versionado

El proyecto sigue versionado semántico `MAJOR.MINOR.PATCH`:

- `PATCH`: correcciones, ajustes pequeños y mejoras internas
- `MINOR`: nuevas funcionalidades manteniendo compatibilidad
- `MAJOR`: cambios de ruptura o cambios arquitectónicos importantes

La versión actual está marcada en:

- `package.json`
- `server/index.ts`
- `src/main.tsx`

## Docker export para Portainer

El proyecto puede exportarse como imagen de Docker para importarla en Portainer:

```bash
docker build -t pazus-mediaserver:latest .
docker save -o pazus-mediaserver.tar pazus-mediaserver:latest
```

El tar generado puede usarse para cargar la imagen en Portainer o en cualquier entorno compatible con `docker load`.

## Scripts disponibles

```bash
pnpm install
pnpm dev
pnpm build
pnpm start
pnpm test
```

Antes de abrir una pull request, ejecuta `pnpm build` y `pnpm test`.

## Stack principal

- React
- Vite
- Fastify
- SQLite
- Vidstack
- FFmpeg
- Docker
- TypeScript

## Desarrollo y contribuciones

Las contribuciones son bienvenidas. Para proponer un cambio:

1. Crea una rama a partir de `main`.
2. Mantén los cambios centrados y actualiza la documentación cuando corresponda.
3. Ejecuta `pnpm build` y `pnpm test`.
4. Abre una pull request describiendo el cambio y su validación.

## Roadmap / notas de desarrollo

Entre mejoras implementadas están:

- soporte para vídeos y audio en múltiples formatos
- favoritos y marcado de visto
- filtros, búsqueda y paginación de galería
- mejoras móviles reales basadas en el navegador y no en la orientación de la pantalla
- manejo más seguro de tareas pesadas con FFmpeg
- logs útiles para despliegue y observabilidad

## Nota sobre el desarrollo con Copilot

Este proyecto fue construido, depurado y refinado en gran parte con GitHub Copilot como demostración de la capacidad del agente para:

- generar estructura del proyecto
- definir arquitectura
- implementar APIs en Fastify
- construir la interfaz React/Vite
- corregir problemas de UX responsive
- depurar cuelgues, regressions y render issues
- preparar configuración de despliegue y Docker
- mantener el proyecto ejecutable y consistente

La intención de este repositorio es servir como ejemplo de trabajo real con asistentes de codificación en un flujo de desarrollo práctico y completo.

## Licencia

Este proyecto se distribuye bajo la licencia [MIT](LICENSE). Consulta el archivo `LICENSE` para conocer los términos completos.
