import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ItemBrowser } from '../components/ItemBrowser.js';
import { SearchField } from '../components/SearchField.js';
import { useDebounced } from '../lib/hooks.js';
import { IconSearch } from '../lib/icons.js';

export function SearchRoute() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const [term, setTerm] = useState(query);
  const debounced = useDebounced(term, 300);

  // La búsqueda vive en la URL: se puede compartir y el botón atrás funciona.
  useEffect(() => {
    setParams(debounced.trim() ? { q: debounced.trim() } : {}, { replace: true });
  }, [debounced, setParams]);

  const baseQuery = useMemo(() => ({ q: query || undefined }), [query]);

  return (
    <>
      <div className="page-head">
        <div style={{ width: '100%' }}>
          <p className="eyebrow">Buscar</p>
          <h1>{query ? `Resultados para «${query}»` : 'Buscar en la biblioteca'}</h1>
          <div style={{ marginTop: 'var(--s-3)', maxWidth: 560 }}>
            <SearchField value={term} onChange={setTerm} label="Buscar en la biblioteca" autoFocus />
          </div>
        </div>
      </div>

      {query ? (
        <ItemBrowser
          baseQuery={baseQuery}
          showSearch={false}
          showFilters={false}
          emptyTitle="Sin resultados"
          emptyDescription="Ningún archivo coincide con esa búsqueda. Prueba con menos palabras."
        />
      ) : (
        <div className="state">
          <IconSearch />
          <strong>¿Qué quieres ver?</strong>
          <p>Escribe el título de una canción, un opening o el nombre de un archivo. La búsqueda ignora mayúsculas y acentos.</p>
        </div>
      )}
    </>
  );
}
