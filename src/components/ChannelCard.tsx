import { Link } from 'react-router-dom';
import { formatRelative } from '../lib/format.js';
import type { ChannelSummary } from '../lib/types.js';
import { Artwork } from './Artwork.js';
import { ProgressBar } from './ProgressBar.js';

/** Tarjeta de canal: carátula, nombre y progreso visto/total como barra fina. */
export function ChannelCard({ channel }: { channel: ChannelSummary }) {
  const ratio = channel.items > 0 ? channel.watched / channel.items : 0;

  return (
    <article className="card">
      <div className="card-media">
        <Artwork kind="video" src={channel.artworkUrl} />
      </div>
      <div className="card-body">
        <h3 className="card-title clamp-2">
          <Link className="card-stretch" to={`/c/${encodeURIComponent(channel.category)}/${encodeURIComponent(channel.name)}`}>
            {channel.name}
          </Link>
        </h3>
        <p className="card-meta">
          <span className="clamp-1">
            {channel.items} {channel.items === 1 ? 'archivo' : 'archivos'}
          </span>
          {channel.latestAt && <span className="clamp-1">{formatRelative(channel.latestAt)}</span>}
        </p>
        <ProgressBar value={ratio} label={`${channel.watched} de ${channel.items} vistos`} />
      </div>
    </article>
  );
}
