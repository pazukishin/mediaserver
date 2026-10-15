# DESIGN.md — MediaServer

Contrato visual y de interacción de la aplicación. Es la fuente de verdad para
cualquier cambio de interfaz: si una pantalla se desvía de lo que hay aquí, la
pantalla está mal, no este documento.

- **Superficie:** aplicación web `MediaServer` (React + Vite, `src/`).
- **Dirección:** *media-first, oscuro limpio*. El contenido manda: la carátula es
  el interfaz y el chrome desaparece.
- **Ámbito:** móvil primero (uso real en teléfono), escritorio después.

## 1. Principios

1. **La carátula es el interfaz.** Nada de marcos decorativos alrededor del arte:
   ni bordes de color, ni sombras duras, ni etiquetas permanentes. El arte ocupa
   la mayor superficie posible del tile.
2. **Chrome mínimo.** Cada elemento fijo (barra superior, navegación, controles)
   debe justificar el alto que roba al contenido. En móvil, la navegación va
   abajo y es fina.
3. **Oscuro limpio, no negro.** Fondo casi neutro con una elevación sutil por
   capa. Nunca `#000` como superficie ni `#fff` como texto.
4. **Contraste cómodo, no máximo.** El texto claro sobre oscuro ya se renderiza
   "flojo" en Linux (FreeType no corrige la gamma; ver la lección del vault
   *Modo oscuro en Linux cansa más la vista que en Windows*). Objetivo: **cuerpo
   entre 9:1 y 13:1**, nunca 17:1. Texto principal `#e6e3ea`, jamás `#fff`.
5. **Nada por debajo de 12px.** El mínimo real de la interfaz es `12px` y sólo
   para metadatos; el cuerpo es `15px`.
6. **Todo lo táctil mide ≥44×44px** y tiene estado `:active` visible.
7. **Sin saltos de layout.** El espacio de la carátula se reserva siempre
   (`aspect-ratio`), también mientras carga.
8. **El movimiento es opcional.** Todo se desactiva con
   `prefers-reduced-motion: reduce`.

## 2. Tokens

Definidos una sola vez en `src/styles/tokens.css` como custom properties.
Prohibido escribir colores, radios, sombras o tamaños de fuente literales en
cualquier otro fichero CSS.

### 2.1 Color — tema oscuro (por defecto)

| Token | Valor | Uso |
| --- | --- | --- |
| `--bg` | `#0b0b0f` | lienzo de la aplicación |
| `--surface` | `#131318` | barras, barra lateral |
| `--surface-2` | `#1a1a21` | menús, hojas, campos |
| `--surface-3` | `#23232c` | hover de superficie, chips |
| `--border` | `#26262e` | hairlines |
| `--border-strong` | `#35353f` | separadores, controles |
| `--text` | `#d6d2dd` | texto principal (**≈13:1**, nunca blanco puro) |
| `--text-muted` | `#a19dae` | texto secundario (≈7,4:1) |
| `--text-subtle` | `#7e7a8b` | sólo ≥14px y no esencial (≈4,7:1) |
| `--accent` | `#9d6bff` | acción, estado activo, progreso (≈5,6:1) |
| `--accent-strong` | `#b48cff` | hover |
| `--accent-soft` | `rgba(157, 107, 255, 0.14)` | fondos teñidos |
| `--on-accent` | `#0b0b0f` | texto sobre accent |
| `--danger` | `#ff7a7a` | errores |

### 2.2 Color — tema claro

Se activa con `[data-theme="light"]` en `<html>`. Sigue
`prefers-color-scheme` salvo que el usuario lo fuerce en Ajustes, y se resuelve
**antes del primer pintado** (`public/theme-boot.js`) para que no haya destello.

| Token | Valor |
| --- | --- |
| `--bg` | `#f6f6f9` |
| `--surface` | `#ffffff` |
| `--surface-2` | `#ffffff` |
| `--surface-3` | `#ececf2` |
| `--border` | `#e5e5ee` |
| `--border-strong` | `#d2d2de` |
| `--text` | `#1a1a20` |
| `--text-muted` | `#57576a` |
| `--text-subtle` | `#6d6d80` |
| `--accent` | `#6d3fd4` |
| `--accent-strong` | `#5a2fc0` |
| `--on-accent` | `#ffffff` |
| `--danger` | `#c0392b` |

### 2.3 Espacio, radio, tipografía, movimiento

```
--s-1: 4px   --s-2: 8px   --s-3: 12px  --s-4: 16px
--s-5: 24px  --s-6: 32px  --s-7: 48px  --s-8: 64px

--r-xs: 6px  --r-sm: 10px  --r-md: 14px  --r-lg: 20px  --r-full: 999px

--fs-xs: 12px  --fs-sm: 13px  --fs-base: 15px  --fs-md: 17px
--fs-lg: 20px  --fs-xl: clamp(22px, 5vw, 26px)  --fs-2xl: clamp(28px, 7vw, 38px)
--lh-tight: 1.2  --lh-base: 1.5
--fw-regular: 400  --fw-medium: 500  --fw-semibold: 600  --fw-bold: 700

--dur-fast: 120ms  --dur: 200ms  --ease: cubic-bezier(.2, .8, .2, 1)
```

**Tipografía.** Una sola familia: **Inter Variable**, auto-hospedada mediante
`@fontsource-variable/inter` (nada de `@import` a Google Fonts: rompe el
render-blocking y el espíritu self-hosted). Los títulos usan `--fw-semibold` con
`letter-spacing: -.02em`; no hay segunda familia.

### 2.4 Breakpoints

Se usan media queries reales; **prohibido** detectar el dispositivo por
`navigator.userAgent` (el código anterior lo hacía y rompía "Sitio de escritorio"
en Android, iPad y ventanas estrechas).

- `(max-width: 599px)` — móvil: barra superior 56px + **navegación inferior**.
- `(min-width: 600px)` — el buscador pasa a estar en línea en la barra superior.
- `(min-width: 900px)` — el reproductor añade la columna lateral de cola.
- `(min-width: 1024px)` — escritorio: barra lateral de 244px, sin navegación
  inferior.
- El estado del reproductor (`data-mode`) usa `useMatch('/ver/:id')`, no el
  tamaño de la ventana.

## 3. Estructura de pantalla

```
┌─ AppBar (56/64px, sticky, blur, hairline) ────────────────┐
│  marca · búsqueda · acciones                              │
├───────────────────────────────────────────────────────────┤
│  contenido (padding 16px móvil / 32px escritorio)         │
│                                                           │
├─ MiniPlayer (sólo si hay reproducción activa) ────────────┤
├─ BottomNav (4 destinos, 56px + safe-area) ────────────────┤
└───────────────────────────────────────────────────────────┘
```

### 3.1 Navegación

| Destino | Ruta | Icono |
| --- | --- | --- |
| Inicio | `/` | casa |
| Biblioteca | `/biblioteca` | rejilla |
| Favoritos | `/favoritos` | corazón |
| Ajustes | `/ajustes` | engranaje |

Rutas profundas: `/c/:categoria`, `/c/:categoria/:canal`, `/ver/:id`,
`/buscar?q=`. El historial del navegador **debe** funcionar: el gesto de volver
de Android cierra el reproductor u hojas antes de salir de la aplicación.

### 3.2 Inicio

1. **Seguir viendo** — carrusel horizontal de lo empezado y no terminado, con
   barra de progreso y tiempo restante. Si está vacío, el bloque no se muestra.
2. **Añadido recientemente** — rejilla.
3. **Categorías** — fila de chips con recuento.

### 3.3 Biblioteca → categoría → canal

- Biblioteca: rejilla de categorías con carátula de su canal más reciente.
- Categoría: rejilla de canales (carátula 16/9, nombre, `n` archivos, progreso
  visto/total como barra fina, no como texto de colores).
- Canal: cabecera con carátula, nombre y contadores + barra de herramientas
  (buscar, ordenar, filtrar) + rejilla de archivos.

### 3.4 Ajustes

Tema (sistema/claro/oscuro), tamaño de las tarjetas, autoplay, densidad,
idioma de la interfaz (sólo `es` por ahora), y zona peligrosa (reiniciar
progreso, borrar vistos, borrar favoritos) con confirmación explícita.

## 4. Componentes

Todos en `src/components/`, sin lógica de obtención de datos dentro.

- **`ArtworkTile`** — contenedor de arte con `aspect-ratio: 16/9`, radio `--r-md`,
  `--surface-2` como fondo. Vídeo → `object-fit: cover`. Audio → carátula
  `contain` sobre fondo desenfocado derivado de la propia carátula.
  Estados: cargando (bloque con brillo sutil), vacío (icono tenue), error
  (icono tenue).
- **`MediaCard`** — tile + título (2 líneas, `clamp`), metadatos (`canal ·
  duración`), barra de progreso si `position > 0`, indicador de visto discreto
  (un check, no una etiqueta "VISTO" en mayúsculas), botón de favorito fantasma
  (visible siempre en puntero grueso). Es un `<a>` (navegable con teclado y
  abrible en pestaña nueva), no un `<div onClick>`.
- **`ProgressBar`** — fina (3px), `--accent`, con `role="progressbar"` y
  `aria-valuenow`.
- **`Skeleton` / `SkeletonGrid`** — sustituye al `return null` que dejaba la
  pantalla en blanco al arrancar.
- **`EmptyState`** — icono, frase y **acción** (nunca sólo "no hay nada").
- **`Sheet`** — hoja inferior en móvil, diálogo centrado en escritorio. Foco
  atrapado, cierre con Escape y con el botón atrás, devuelve el foco al
  elemento que la abrió.
- **`BottomNav`**, **`Sidebar`**, **`AppBar`**, **`SearchField`** (con limpiar y
  `enterkeyhint="search"`), **`SegmentedControl`**, **`Toggle`**.
- **`ScanPanel`** — progreso del escaneo con cancelación; en móvil es una hoja.
- **`PlayerDock`** — el reproductor persistente (ver §6).
- **`Toast`** — confirmación de acciones optimistas con opción de deshacer
  (favorito, marcar visto) en lugar de revertir en silencio.

## 5. Estados y datos

- **Carga**: nunca pantalla en blanco. Esqueletos con la forma real del
  contenido.
- **Vacío**: frase + acción concreta (p. ej. "Escanear la biblioteca").
- **Error**: mensaje en lenguaje llano + botón "Reintentar"; nunca un `alert`.
- **Optimista**: favorito y visto se aplican al instante y se revierten con
  aviso si el servidor falla.
- **Persistencia local**: tema, tamaño de tarjetas, orden y autoplay en
  `localStorage`. Sobreviven a la recarga (hoy se perdían).
- **Nada se recalcula entero en cada tecla**: búsqueda con retardo de 200ms y
  filtrado resuelto por el servidor cuando la consulta es global.

## 6. Reproductor

Una **sola instancia** de `MediaPlayer` (Vidstack) vive en el árbol, dentro de
`PlayerDock`, y **nunca se desmonta al navegar**: la reproducción no se corta.

| Modo | Cuándo | Presentación |
| --- | --- | --- |
| `hidden` | nada en cola | no se renderiza |
| `mini` | hay reproducción y la ruta no es `/ver/:id` | barra fija sobre la navegación: arte 40px, título, play/pausa, progreso |
| `full` | ruta `/ver/:id` | a pantalla completa en móvil; overlay con columna lateral de cola en escritorio |

- **Cola**: reproducible por canal ("Reproducir todo"), con siguiente/anterior y
  autoplay. La cola vive en el contexto del reproductor, no en cada pantalla.
- **MediaSession**: título, canal, carátula y posición en la pantalla de bloqueo
  y los auriculares; manejadores de `play`, `pause`, `previoustrack`,
  `nexttrack`, `seekto`.
- **Reanudar**: si hay posición guardada y el elemento no está visto, se ofrece
  "Continuar desde mm:ss" en lugar de saltar en silencio.
- **Gestos móviles**: doble toque izquierda/derecha para ±10s (declarando **una**
  zona por lado, no dos manejadores sobre el mismo evento, como hacía el código
  anterior), deslizamiento vertical para el brillo/volumen del reproductor.
- **Móvil**: sin columna lateral; la cola se abre como hoja inferior. Se respetan
  `env(safe-area-inset-*)` y `100dvh`.

## 7. Accesibilidad (no negociable)

- Contraste ≥ 4.5:1 en texto normal y ≥ 3:1 en texto grande e iconos.
- Foco visible propio (`:focus-visible` con `outline: 2px solid var(--accent)`
  y `outline-offset: 2px`) en **todo** elemento interactivo.
- Todo control tiene nombre accesible; los iconos decorativos van con
  `aria-hidden="true"`.
- Diálogos con `role="dialog"`, `aria-modal`, foco atrapado y devolución del
  foco.
- `aria-live="polite"` para el progreso del escaneo y los avisos.
- Navegación completa por teclado, incluida la rejilla (flechas) y Escape.
- `prefers-reduced-motion: reduce` desactiva transiciones y desplazamientos
  suaves.

## 8. Rendimiento

- Rejilla con carga progresiva (scroll infinito por `IntersectionObserver`) en
  lugar de paginación con flechas.
- Imágenes con `loading="lazy"`, `decoding="async"` y `sizes` acordes a la
  rejilla; las carátulas se sirven desde `/cache/` con caché larga.
- Sin cálculo de rejilla en JavaScript: la disposición la resuelve CSS
  (`grid-template-columns: repeat(auto-fill, minmax(var(--card-w), 1fr))`).
  El código anterior mantenía la misma lógica duplicada en JS y en CSS, y
  divergían.
- El paquete de entrada no debe crecer: el reproductor se carga en diferido
  (`React.lazy`) porque no se necesita hasta que el usuario abre algo.
