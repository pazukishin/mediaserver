import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLibrary } from '../data/LibraryProvider.js';
import { usePlayer } from '../data/PlayerProvider.js';
import { usePreferences } from '../data/Preferences.js';
import { useItemList } from '../data/useItemList.js';
import { api } from '../lib/api.js';
import { useLocalStorage, useOnScreen } from '../lib/hooks.js';
import { IconArrowDown, IconArrowUp, IconInbox, IconPlay } from '../lib/icons.js';
import type { Item, ItemFilter, ItemQuery, ItemSort, SortDirection } from '../lib/types.js';
import { MediaCard } from './MediaCard.js';
import { SegmentedControl } from './SegmentedControl.js';
import { EmptyState, ErrorState, SkeletonGrid } from './States.js';

const FILTERS: Array<{ value: ItemFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'unwatched', label: 'Por ver' },
  { value: 'watched', label: 'Vistos' },
  { value: 'favorite', label: 'Favoritos' },
];

const SORTS: Array<{ value: ItemSort; label: string }> = [
  { value: 'name', label: 'Nombre' },
  { value: 'created', label: 'Fecha del archivo' },
  { value: 'added', label: 'Añadido' },
  { value: 'duration', label: 'Duración' },
  { value: 'watched', label: 'Visto por última vez' },
];

const CARD_SIZE_OPTIONS = [
  { value: 'compact', label: 'S', ariaLabel: 'Tarjetas pequeñas' },
  { value: 'cozy', label: 'M', ariaLabel: 'Tarjetas medianas' },
  { value: 'roomy', label: 'L', ariaLabel: 'Tarjetas grandes' },
] as const;

type ItemBrowserProps = {
  baseQuery: ItemQuery;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  showFilters?: boolean;
  /** Nombre del ámbito («este canal», «favoritos») cuando la búsqueda filtra dentro de una lista. */
  scopeLabel?: string;
  /** Acciones extra en la barra de herramientas. */
  extraTools?: ReactNode;
};

/**
 * Rejilla de archivos con barra de herramientas, filtros y carga progresiva.
 *
 * No tiene buscador propio: el término y el filtro viven en la URL y los pone el
 * único buscador de la aplicación (`AppBar`). Así la vista se puede enlazar, el
 * botón atrás funciona y no hay dos campos de búsqueda en la misma pantalla.
 */
export function ItemBrowser({
  baseQuery,
  emptyTitle,
  emptyDescription,
  emptyAction,
  showFilters = true,
  scopeLabel,
  extraTools,
}: ItemBrowserProps) {
  const { resolve, setFavorite, revision } = useLibrary();
  const { play } = usePlayer();
  const { cardSize, setCardSize } = usePreferences();
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useLocalStorage<ItemSort>('ms.sort', 'name');
  const [dir, setDir] = useLocalStorage<SortDirection>('ms.dir', 'asc');
  const [starting, setStarting] = useState(false);

  const urlQuery = params.get('q') ?? '';
  const filter = (params.get('filtro') as ItemFilter | null) ?? 'all';
  // La consulta del llamante manda; el término de la URL sólo la completa.
  const term = baseQuery.q ?? urlQuery;

  const changeFilter = useCallback(
    (value: ItemFilter) => {
      const next = new URLSearchParams(params);
      if (value === 'all') next.delete('filtro');
      else next.set('filtro', value);
      // `replace`: recorrer filtros no debe llenar el historial de atrás.
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const query = useMemo<ItemQuery>(
    () => ({
      ...baseQuery,
      q: term || undefined,
      filter: showFilters ? filter : baseQuery.filter,
      sort,
      dir,
    }),
    [baseQuery, term, filter, showFilters, sort, dir],
  );

  const list = useItemList(query, revision);
  const sentinelRef = useOnScreen<HTMLDivElement>(() => list.loadMore(), list.hasMore);

  /** Reproduce la lista completa (hasta 500 elementos) empezando por este. */
  const playAll = useCallback(
    async (from: Item) => {
      setStarting(true);
      try {
        const page = await api.items({ ...baseQuery, q: term || undefined, filter, sort, dir, limit: 500 });
        play(from, page.items.length > 0 ? page.items : [from]);
      } finally {
        setStarting(false);
      }
    },
    [baseQuery, term, filter, sort, dir, play],
  );

  const { reload } = list;
  const effectiveFilter = showFilters ? filter : baseQuery.filter;
  const handleFavorite = useCallback(
    (item: Item, favorite: boolean) => {
      setFavorite(item, favorite);
      // Quitar de favoritos dentro de una lista de favoritos tiene que sacarlo
      // de la lista, no dejarlo ahí hasta la siguiente recarga.
      if (!favorite && effectiveFilter === 'favorite') reload();
    },
    [setFavorite, effectiveFilter, reload],
  );
  const resolved = list.items.map(resolve);
  const firstItem = resolved[0];

  return (
    <div className="section">
      <div className="toolbar">
        <label className="sr-only" htmlFor="ms-sort">
          Ordenar por
        </label>
        <select id="ms-sort" className="select" value={sort} onChange={(event) => setSort(event.target.value as ItemSort)}>
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setDir(dir === 'asc' ? 'desc' : 'asc')}
          aria-label={dir === 'asc' ? 'Orden ascendente, pulsa para invertir' : 'Orden descendente, pulsa para invertir'}
        >
          {dir === 'asc' ? <IconArrowUp /> : <IconArrowDown />}
        </button>
        <SegmentedControl label="Tamaño de las tarjetas" value={cardSize} onChange={setCardSize} options={CARD_SIZE_OPTIONS} />
        {resolved.length > 0 && firstItem && (
          <button type="button" className="btn btn-ghost" disabled={starting} onClick={() => void playAll(firstItem)}>
            <IconPlay />
            Reproducir todo
          </button>
        )}
        {extraTools}
      </div>

      {showFilters && (
        <div className="toolbar-scroll">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="chip"
              aria-pressed={filter === option.value}
              onClick={() => changeFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {/* El recuento va fuera de la fila desplazable: dentro se cortaba («3 archiv»). */}
      <p className="sub">
        {list.total} {list.total === 1 ? 'archivo' : 'archivos'}
        {showFilters && filter !== 'all' ? ' con este filtro' : ''}
      </p>

      {scopeLabel && term && (
        <p className="sub">
          Filtrando por «{term}» en {scopeLabel}. <Link to={`/buscar?q=${encodeURIComponent(term)}`}>Buscar en toda la biblioteca</Link>
        </p>
      )}

      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}

      {!list.error && list.loading && <SkeletonGrid count={12} size={cardSize} />}

      {!list.error && !list.loading && resolved.length === 0 && (
        <EmptyState icon={<IconInbox />} title={emptyTitle} description={emptyDescription} action={emptyAction} />
      )}

      {!list.error && resolved.length > 0 && (
        <div className="grid" data-size={cardSize}>
          {resolved.map((item, index) => (
            <MediaCard key={item.id} item={item} to={`/ver/${item.id}`} eager={index < 8} onFavorite={handleFavorite} />
          ))}
        </div>
      )}

      {list.hasMore && (
        <div ref={sentinelRef} className="fila" style={{ justifyContent: 'center', padding: 'var(--s-5) 0' }}>
          <span className="sub">Cargando más…</span>
        </div>
      )}
    </div>
  );
}
