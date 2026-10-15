import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import { formatDuration } from '../lib/format.js';
import { IconChevronLeft, IconGrid, IconHeart, IconHome, IconRefresh, IconSearch, IconSettings } from '../lib/icons.js';
import type { CategorySummary } from '../lib/types.js';
import { SearchField } from './SearchField.js';

const APP_NAME = 'MediaServer';
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';

const mainLinks = [
  { to: '/', label: 'Inicio', Icon: IconHome, end: true },
  { to: '/biblioteca', label: 'Biblioteca', Icon: IconGrid, end: false },
  { to: '/favoritos', label: 'Favoritos', Icon: IconHeart, end: false },
  { to: '/ajustes', label: 'Ajustes', Icon: IconSettings, end: false },
] as const;

/**
 * Única entrada de búsqueda de la aplicación.
 *
 * Antes había tres controles que competían: el campo de la barra superior, el
 * icono de la lupa (que llevaba a la misma búsqueda) y otro campo dentro de cada
 * lista. Ahora hay un solo campo y su alcance lo dice el marcador de posición:
 * dentro de un canal filtra ese canal, en favoritos filtra los favoritos y en
 * el resto busca en toda la biblioteca. En la ruta /buscar el campo ocupa la
 * barra entera y se enfoca solo, así que allí no hay un segundo buscador.
 */
export function AppBar({ onScan, scanning }: { onScan: () => void; scanning: boolean }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const channelMatch = useMatch('/c/:category/:channel');

  const scope = channelMatch
    ? { path: pathname, label: `Buscar en «${decodeURIComponent(channelMatch.params.channel ?? '')}»…` }
    : pathname === '/favoritos'
      ? { path: pathname, label: 'Buscar en favoritos…' }
      : null;
  const onSearchPage = pathname === '/buscar';
  const urlQuery = params.get('q') ?? '';
  const mirrorsUrl = onSearchPage || scope !== null;

  const [term, setTerm] = useState(mirrorsUrl ? urlQuery : '');
  // En pantallas estrechas el campo se despliega al pulsar la lupa: se busca
  // donde estás, sin saltar a otra pantalla.
  const [expanded, setExpanded] = useState(false);
  const fieldVisible = onSearchPage || expanded;

  // Al entrar en una vista con búsqueda propia, el campo refleja lo que ya
  // estaba filtrado. Mientras se escribe no se toca, porque la URL no cambia.
  useEffect(() => {
    if (mirrorsUrl) setTerm(urlQuery);
  }, [mirrorsUrl, urlQuery]);

  const submit = () => {
    const value = term.trim();
    if (scope) {
      const next = new URLSearchParams(params);
      if (value) next.set('q', value);
      else next.delete('q');
      const query = next.toString();
      navigate(query ? `${scope.path}?${query}` : scope.path);
      return;
    }
    if (value) navigate(`/buscar?q=${encodeURIComponent(value)}`);
  };

  const closeField = () => {
    setExpanded(false);
    setTerm(mirrorsUrl ? urlQuery : '');
  };

  return (
    <header className="appbar" data-search={fieldVisible ? 'on' : undefined}>
      {!fieldVisible && (
        <Link to="/" className="appbar-brand">
          <span className="mark" aria-hidden="true">
            M
          </span>
          <span className="clamp-1">{APP_NAME}</span>
        </Link>
      )}

      <div
        className="appbar-inline-search"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !onSearchPage) closeField();
        }}
      >
        <SearchField
          value={term}
          onChange={setTerm}
          onSubmit={submit}
          autoFocus={onSearchPage || expanded}
          label={scope ? scope.label.replace('…', '') : 'Buscar en la biblioteca'}
          placeholder={scope ? scope.label : 'Buscar en la biblioteca…'}
        />
      </div>

      <div className="appbar-spacer" />

      <div className="appbar-actions">
        {/* La lupa es la misma búsqueda cuando el campo no cabe (pantallas
            estrechas); nunca se ven las dos cosas a la vez. */}
        {!onSearchPage && (
          <button
            type="button"
            className="icon-btn appbar-only-mobile"
            aria-label={expanded ? 'Salir de la búsqueda' : 'Buscar'}
            aria-expanded={expanded}
            onClick={() => (expanded ? closeField() : setExpanded(true))}
          >
            {/* Salir se dibuja como «volver», no como otra equis: dentro del
                campo ya hay una para limpiar el texto. */}
            {expanded ? <IconChevronLeft /> : <IconSearch />}
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={onScan}
          disabled={scanning}
          aria-label={scanning ? 'Escaneando la biblioteca' : 'Escanear la biblioteca'}
        >
          <IconRefresh className={scanning ? 'spin' : undefined} />
        </button>
      </div>
    </header>
  );
}

export function BottomNav() {
  return (
    <nav className="bottomnav" aria-label="Navegación principal">
      {mainLinks.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className="nav-item">
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function Sidebar({ categories }: { categories: CategorySummary[] }) {
  return (
    <nav className="sidebar" aria-label="Navegación principal">
      <Link to="/" className="appbar-brand" style={{ padding: 'var(--s-2) var(--s-3) var(--s-3)' }}>
        <span className="mark" aria-hidden="true">
          M
        </span>
        <span>{APP_NAME}</span>
      </Link>

      {mainLinks.slice(0, 3).map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className="side-link">
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}

      <p className="sidebar-group">Categorías</p>
      {categories.length === 0 && (
        <p style={{ padding: '0 var(--s-3)', color: 'var(--text-subtle)', fontSize: 'var(--fs-sm)' }}>Sin categorías todavía.</p>
      )}
      {categories.map((category) => (
        <NavLink key={category.name} to={`/c/${encodeURIComponent(category.name)}`} className="side-link">
          <IconGrid />
          <span className="clamp-1" style={{ flex: '1 1 auto' }}>
            {category.name}
          </span>
          <span style={{ color: 'var(--text-subtle)', fontSize: 'var(--fs-xs)' }}>{category.items}</span>
        </NavLink>
      ))}

      <div className="sidebar-foot">
        <NavLink to="/ajustes" className="side-link">
          <IconSettings />
          <span>Ajustes</span>
        </NavLink>
        <p style={{ padding: 'var(--s-2) var(--s-3) 0' }}>v{APP_VERSION}</p>
      </div>
    </nav>
  );
}

/** Resumen compacto reutilizado en categorías y canales. */
export function LibraryStats({ items, watched, duration }: { items: number; watched: number; duration: number }) {
  return (
    <p className="sub">
      {items} archivos · {watched} vistos{duration > 0 ? ` · ${formatDuration(duration)}` : ''}
    </p>
  );
}
