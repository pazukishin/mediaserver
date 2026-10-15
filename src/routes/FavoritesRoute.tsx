import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ItemBrowser } from '../components/ItemBrowser.js';
import { IconHeart } from '../lib/icons.js';

export function FavoritesRoute() {
  const baseQuery = useMemo(() => ({ filter: 'favorite' as const }), []);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Tu selección</p>
          <h1>Favoritos</h1>
          <p className="sub">Todo lo que has marcado con el corazón, en cualquier categoría.</p>
        </div>
        <Link className="chip" to="/biblioteca">
          <IconHeart />
          Explorar la biblioteca
        </Link>
      </div>

      <ItemBrowser
        baseQuery={baseQuery}
        showFilters={false}
        emptyTitle="Todavía no tienes favoritos"
        emptyDescription="Pulsa el corazón de cualquier archivo para guardarlo aquí."
        emptyAction={
          <Link className="btn btn-primary" to="/biblioteca">
            Ir a la biblioteca
          </Link>
        }
      />
    </>
  );
}
