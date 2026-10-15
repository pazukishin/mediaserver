# Plan y hoja de ruta

Este documento ya no describe la fase inicial del proyecto (esa historia está en
el historial de git). Recoge **qué entra en la versión 2.0** y **qué queda
deliberadamente fuera**, para que se pueda decidir con conocimiento de causa.

## Alcance de la 2.0

Objetivo: que la aplicación sea agradable y rápida de usar **en el móvil**, y que
el servidor sea seguro y no pierda datos.

Entra:

1. **Interfaz reescrita** con dirección visual *media-first* y sistema de tokens
   ([DESIGN.md](DESIGN.md)), tema oscuro y claro.
2. **Disposición responsive real** (CSS, sin detectar el dispositivo por
   user-agent) y navegación con historial.
3. **PWA instalable** con service worker: cáscara cacheada y carátulas offline.
4. **Reproductor persistente** con mini reproductor, cola, siguiente/anterior y
   controles del sistema (MediaSession).
5. **Seguir viendo** con progreso y duración real.
6. **Accesibilidad**: teclado, foco, nombres accesibles, contrastes y objetivos
   táctiles.
7. **Servidor refactorizado y endurecido** con el contrato de [docs/API.md](docs/API.md):
   una sola tabla de estado, migración automática con copia previa, escaneo
   incremental y cancelable, duración con `ffprobe`, carátulas de audio, medios
   autenticados, validación con Zod, cabeceras de seguridad y `/api/health`.
8. **Verificación**: tests unitarios con Vitest y end-to-end con Playwright sobre
   una biblioteca de pruebas propia, con capturas en `docs/capturas/`.

## Fuera de alcance (a propósito)

No entra en la 2.0, por coste o por riesgo, y conviene decidirlo aparte:

- **Transcodificación en el servidor.** Los contenedores que el navegador no
  reproduce (`.mkv`, `.avi`) se explican en la interfaz y se pueden descargar,
  pero no se convierten al vuelo. Añadirlo implica sesiones de FFmpeg, control de
  CPU y caché de segmentos: es un proyecto en sí mismo.
- **Subtítulos** (`.srt`/`.vtt` servidos como pista). La base está puesta
  (Vidstack los soporta), pero falta detectarlos en el escaneo y exponerlos.
- **Varios usuarios** con permisos distintos. El diseño actual es de un único
  usuario por variables de entorno.
- **Historial de reproducción** como vista propia (la tabla ya guarda lo
  necesario para construirlo).
- **Transcodificación de las carátulas a varios tamaños**: hoy se sirve un único
  JPEG de 640 px de ancho.
- **Auto-escaneo** al detectar cambios en disco (`chokidar`/`inotify`). Hoy el
  escaneo es manual o por API.
- **Reproducción en segundo plano real en iOS** más allá de lo que permite
  MediaSession.

## Deuda técnica conocida

- El paquete `PlayerDock` ronda los 250 kB (73 kB comprimidos) porque arrastra
  Vidstack. Está en un fragmento aparte y sólo se descarga al reproducir algo,
  pero es el mayor coste de la aplicación.
- El historial de git del repositorio pesa ~800 MB por dos blobs de 422 MB (el
  `.tar` de una imagen de Docker) que se commitearon en su día. Limpiarlo
  requiere reescribir el historial (`git filter-repo`) y no se ha hecho.
- No hay integración continua. Los tests se ejecutan a mano.

## Cómo se verificó

```bash
pnpm typecheck && pnpm test && pnpm lint && pnpm build && pnpm test:e2e
```

Los tests end-to-end generan su propia biblioteca en `.tmp/e2e/`, arrancan el
servidor en el puerto 3210 y dejan capturas de la interfaz en `docs/capturas/`.
