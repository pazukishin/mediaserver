# MediaServer

## Objetivo

Crear un mediaserver privado y ligero para Docker, con una interfaz web inspirada en un catálogo de vídeo y navegación basada en la estructura de carpetas.

## Decisiones de alcance

- Todo el código de aplicación se escribirá en TypeScript.
- La carpeta montada en `/media` se interpreta así:
  - `media/<categoria>/` es una categoría, por ejemplo `Vídeo`, `Audio` o `Audiobooks`.
  - `media/<categoria>/<canal>/` es un canal.
  - Los archivos dentro del canal son los elementos reproducibles.
  - Los archivos directamente en `media/` aparecen bajo `Sin Categoría/Sin Canal`.
  - Los archivos directamente en una categoría aparecen bajo `<categoria>/Sin Canal`.
- La aplicación tratará la biblioteca como solo lectura.
- FFmpeg/FFprobe se utilizarán cuando estén disponibles:
  - FFprobe para duración y metadatos.
  - FFmpeg para generar miniaturas de vídeo.
  - Las carátulas embebidas de audio se extraerán y mostrarán cuando existan.
- No se exigirá HTTPS. El contenedor expondrá HTTP y podrá colocarse detrás de un proxy si se desea.
- La documentación será genérica y no estará ligada a ningún fabricante de NAS.
- Habrá un único usuario configurable por variables de entorno.

## MVP funcional

1. Login, logout y sesión persistente mediante cookie.
2. Escaneo inicial e incremental de `/media`.
3. Vista de categorías y canales.
4. Listado de audio y vídeo con nombre, duración, miniatura o carátula y estado de reproducción.
5. Reproductor HTML5 con reanudación de posición.
6. Marcado automático como reproducido al alcanzar el 90%.
7. Filtros `Todos`, `No reproducidos` y `Reproducidos`.
8. Reinicio individual y global del estado de reproducción.
9. Acción para volver a escanear la biblioteca.
10. Dockerfile, `docker-compose.yml`, variables de entorno, healthcheck y documentación de despliegue genérica.

## Navegación de la interfaz

- Header superior con marca, acciones `Escanear` y `Salir`.
- Menú lateral tipo catálogo con `Últimos vistos` como entrada inicial y las categorías reales debajo.
- Cada categoría muestra el total de elementos.
- La vista de categoría muestra una galería de canales con portada, total de archivos y contadores de vistos/no vistos.
- La vista de canal muestra navegación de vuelta, contadores, filtros y una galería paginada de archivos.
- La vista de canal permite ordenar por nombre o fecha de creación, en orden ascendente o descendente.
- La vista de categoría (galería de canales) admite el mismo control de ordenación por nombre o fecha de creación.
- La galería de archivos permite elegir el tamaño de las tarjetas: Pequeño, Mediano (por defecto) o Grande.
- La paginación de canales y archivos se calcula según el espacio disponible en la ventana; si todos los elementos caben, no se muestra paginación.
- El reproductor usa Vidstack (controles nativos de reproducción, velocidad, avance/retroceso, pantalla completa y PiP) tanto para audio como para vídeo.
- El reproductor muestra hasta diez elementos consecutivos del canal según el orden activo y permite activar AutoPlay para avanzar automáticamente.
- Las galerías usan tarjetas con proporciones uniformes y se adaptan a pantallas pequeñas.
- Los archivos dentro de una carpeta de canal se buscan de forma recursiva: cualquier subcarpeta se trata como si estuviera en la raíz del canal.
- El servidor registra trazas de progreso durante el escaneo y la generación de miniaturas, además de información del contenedor (Node, rutas, disponibilidad de FFmpeg) al arrancar.

## Arquitectura propuesta

- Frontend: React + Vite + TypeScript.
- Backend: Node.js + Fastify + TypeScript.
- Base de datos: SQLite mediante `better-sqlite3`.
- Validación: Zod.
- Sesiones: cookie firmada y tabla de sesiones en SQLite.
- Metadatos: `ffprobe`; miniaturas: `ffmpeg`; carátulas embebidas: extracción con FFmpeg.
- El servidor entregará los recursos con soporte HTTP Range para permitir saltos y reanudación.

## Modelo de datos inicial

- `media_items`: ruta relativa, categoría, canal, tipo, nombre, duración, metadatos, miniatura y fechas.
- `playback_state`: posición, duración observada, reproducido y fecha de actualización.
- `sessions`: token hash, fecha de expiración y última actividad.

## Fases de implementación

1. Bootstrap del monorepo TypeScript y configuración de desarrollo.
2. Esquema SQLite, escáner de carpetas y extracción de metadatos.
3. Autenticación de usuario único y endpoints protegidos.
4. API de categorías, canales, archivos, streaming y estado de reproducción.
5. Interfaz responsive de catálogo y reproductor.
6. Procesamiento de miniaturas y carátulas con caché persistente.
7. Dockerización y documentación genérica.
8. Pruebas de API, escaneo, autenticación, filtros y progreso.

## Criterios de aceptación

- Un árbol `media/Categoria/Canal/archivo` aparece correctamente en la interfaz.
- Los archivos reproducibles se pueden abrir sin copiar la biblioteca al contenedor.
- Un vídeo o audio reanudado conserva su posición.
- El filtro de reproducidos cambia al completar un elemento y el reset lo devuelve a no reproducido.
- La contraseña no aparece en logs ni se almacena en claro.
- El despliegue funciona con un volumen `/media` y otro `/data`, sin configuración específica de un NAS.
