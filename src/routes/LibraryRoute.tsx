import { Link } from 'react-router-dom';
import { Artwork } from '../components/Artwork.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { ErrorState, SkeletonGrid } from '../components/States.js';
import { useLibrary } from '../data/LibraryProvider.js';
import { useAsync } from '../data/useAsync.js';
import { api } from '../lib/api.js';
import { formatDuration, plural } from '../lib/format.js';
import type { CategorySummary } from '../lib/types.js';

export function LibraryRoute() {
  const { revision } = useLibrary();
  const categories = useAsync(() => api.categories(), [revision]);

  if (categories.error) return <ErrorState message={categories.error} onRetry={categories.reload} />;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Explorar</p>
          <h1>Biblioteca</h1>
          {categories.data && <p className="sub">{plural(categories.data.categories.length, 'categoría')}</p>}
        </div>
      </div>

      {categories.loading && !categories.data ? (
        <SkeletonGrid count={6} size="roomy" />
      ) : (
        <div className="grid grid-channels" data-size="roomy">
          {categories.data?.categories.map((category) => (
            <CategoryCard key={category.name} category={category} />
          ))}
        </div>
      )}
    </>
  );
}

function CategoryCard({ category }: { category: CategorySummary }) {
  const ratio = category.items > 0 ? category.watched / category.items : 0;

  return (
    <article className="card">
      <div className="card-media">
        <Artwork kind="video" src={category.artworkUrl} />
      </div>
      <div className="card-body">
        <h3 className="card-title clamp-2">
          <Link className="card-stretch" to={`/c/${encodeURIComponent(category.name)}`}>
            {category.name}
          </Link>
        </h3>
        <p className="card-meta">
          <span className="clamp-1">{plural(category.items, 'archivo')}</span>
          {category.duration > 0 && <span className="clamp-1">{formatDuration(category.duration)}</span>}
        </p>
        <ProgressBar value={ratio} label={`${category.watched} de ${category.items} vistos`} />
      </div>
    </article>
  );
}
