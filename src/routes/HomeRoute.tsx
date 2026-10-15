import { Link } from 'react-router-dom';
import { ContinueCard, MediaCard } from '../components/MediaCard.js';
import { EmptyState, ErrorState, SkeletonGrid, SkeletonRow } from '../components/States.js';
import { useLibrary } from '../data/LibraryProvider.js';
import { useAsync } from '../data/useAsync.js';
import { api } from '../lib/api.js';
import { formatDuration, plural } from '../lib/format.js';
import { IconInbox, IconRefresh } from '../lib/icons.js';

export function HomeRoute({ onScan, scanning }: { onScan: () => void; scanning: boolean }) {
  const { revision, resolve, setFavorite } = useLibrary();
  const home = useAsync(() => api.home(), [revision]);

  if (home.error) return <ErrorState message={home.error} onRetry={home.reload} />;

  if (home.loading && !home.data) {
    return (
      <div className="section">
        <SkeletonRow />
        <SkeletonGrid count={12} />
      </div>
    );
  }

  const data = home.data;
  if (!data) return null;

  if (data.stats.items === 0) {
    return (
      <EmptyState
        icon={<IconInbox />}
        title="La biblioteca está vacía"
        description="Coloca tus archivos en media/<categoría>/<canal>/ y lanza un escaneo para que aparezcan aquí."
        action={
          <button type="button" className="btn btn-primary" onClick={onScan} disabled={scanning}>
            <IconRefresh />
            {scanning ? 'Escaneando…' : 'Escanear la biblioteca'}
          </button>
        }
      />
    );
  }

  const continueWatching = data.continueWatching.map(resolve);
  const recentlyAdded = data.recentlyAdded.map(resolve);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Tu biblioteca</p>
          <h1>Inicio</h1>
          <p className="sub">
            {plural(data.stats.items, 'archivo')} · {plural(data.stats.watched, 'visto')}
            {data.stats.duration > 0 ? ` · ${formatDuration(data.stats.duration)} en total` : ''}
          </p>
        </div>
      </div>

      {continueWatching.length > 0 && (
        <section className="section" aria-labelledby="seguir-viendo">
          <div className="section-head">
            <h2 id="seguir-viendo">Seguir viendo</h2>
            <span className="count">{plural(continueWatching.length, 'archivo')}</span>
          </div>
          <div className="scroller">
            {continueWatching.map((item) => (
              <ContinueCard
                key={item.id}
                item={item}
                to={`/ver/${item.id}`}
                onFavorite={(entry, favorite) => setFavorite(entry, favorite)}
              />
            ))}
          </div>
        </section>
      )}

      {recentlyAdded.length > 0 && (
        <section className="section" aria-labelledby="reciente">
          <div className="section-head">
            <h2 id="reciente">Añadido recientemente</h2>
            <Link className="chip" to="/biblioteca">
              Ver la biblioteca
            </Link>
          </div>
          <div className="grid" data-size="cozy">
            {recentlyAdded.map((item) => (
              <MediaCard key={item.id} item={item} to={`/ver/${item.id}`} onFavorite={(entry, favorite) => setFavorite(entry, favorite)} />
            ))}
          </div>
        </section>
      )}

      {data.categories.length > 0 && (
        <section className="section" aria-labelledby="categorias">
          <div className="section-head">
            <h2 id="categorias">Categorías</h2>
          </div>
          <div className="toolbar-scroll">
            {data.categories.map((category) => (
              <Link key={category.name} className="chip" to={`/c/${encodeURIComponent(category.name)}`}>
                {category.name}
                <span className="num">{category.items}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
