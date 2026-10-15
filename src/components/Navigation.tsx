import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { formatDuration } from '../lib/format.js';
import { IconGrid, IconHeart, IconHome, IconRefresh, IconSearch, IconSettings } from '../lib/icons.js';
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

export function AppBar({ onScan, scanning }: { onScan: () => void; scanning: boolean }) {
  const [term, setTerm] = useState('');
  const navigate = useNavigate();

  return (
    <header className="appbar">
      <Link to="/" className="appbar-brand">
        <span className="mark" aria-hidden="true">
          M
        </span>
        <span className="clamp-1">{APP_NAME}</span>
      </Link>

      <div className="appbar-inline-search">
        <SearchField
          value={term}
          onChange={setTerm}
          onSubmit={() => {
            const query = term.trim();
            if (query) navigate(`/buscar?q=${encodeURIComponent(query)}`);
          }}
        />
      </div>

      <div className="appbar-spacer" />

      <div className="appbar-actions">
        <Link to="/buscar" className="icon-btn appbar-only-mobile" aria-label="Buscar">
          <IconSearch />
        </Link>
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
