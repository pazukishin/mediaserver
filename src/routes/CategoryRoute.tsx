import { Link, useParams } from 'react-router-dom';
import { ChannelCard } from '../components/ChannelCard.js';
import { EmptyState, ErrorState, SkeletonGrid } from '../components/States.js';
import { useLibrary } from '../data/LibraryProvider.js';
import { useAsync } from '../data/useAsync.js';
import { api } from '../lib/api.js';
import { plural } from '../lib/format.js';
import { IconChevronLeft, IconFolder } from '../lib/icons.js';

export function CategoryRoute() {
  const { category = '' } = useParams();
  const { revision } = useLibrary();
  const channels = useAsync(() => api.channels(category), [category, revision]);

  const list = channels.data?.channels ?? [];
  const totalItems = list.reduce((sum, channel) => sum + channel.items, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/biblioteca" className="chip">
            <IconChevronLeft />
            Biblioteca
          </Link>
          <h1 style={{ marginTop: 'var(--s-2)' }} className="clamp-2">
            {category}
          </h1>
          <p className="sub">
            {plural(list.length, 'canal', 'canales')} · {plural(totalItems, 'archivo')}
          </p>
        </div>
      </div>

      {channels.error && <ErrorState message={channels.error} onRetry={channels.reload} />}
      {channels.loading && !channels.data && <SkeletonGrid count={6} size="roomy" />}

      {channels.data && list.length === 0 && (
        <EmptyState
          icon={<IconFolder />}
          title="Esta categoría no tiene canales"
          description="Crea subcarpetas dentro de la categoría y vuelve a escanear."
        />
      )}

      {list.length > 0 && (
        <div className="grid grid-channels" data-size="roomy">
          {list.map((channel) => (
            <ChannelCard key={`${channel.category}/${channel.name}`} channel={channel} />
          ))}
        </div>
      )}
    </>
  );
}
