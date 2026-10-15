import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ItemBrowser } from '../components/ItemBrowser.js';
import { IconChevronLeft, IconRefresh } from '../lib/icons.js';

export function ChannelRoute({ onScan, scanning }: { onScan: () => void; scanning: boolean }) {
  const { category = '', channel = '' } = useParams();
  const baseQuery = useMemo(() => ({ category, channel }), [category, channel]);

  return (
    <>
      <div className="page-head">
        <div>
          <Link to={`/c/${encodeURIComponent(category)}`} className="chip">
            <IconChevronLeft />
            {category}
          </Link>
          <h1 style={{ marginTop: 'var(--s-2)' }} className="clamp-2">
            {channel}
          </h1>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onScan} disabled={scanning}>
          <IconRefresh className={scanning ? 'spin' : undefined} />
          {scanning ? 'Escaneando…' : 'Escanear'}
        </button>
      </div>

      <ItemBrowser
        baseQuery={baseQuery}
        scopeLabel="este canal"
        emptyTitle="No hay archivos con estos filtros"
        emptyDescription="Prueba con otro filtro o vuelve a escanear la biblioteca."
        emptyAction={
          <button type="button" className="btn btn-ghost" onClick={onScan} disabled={scanning}>
            <IconRefresh />
            Escanear
          </button>
        }
      />
    </>
  );
}
