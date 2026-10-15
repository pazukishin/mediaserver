import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ItemBrowser } from '../components/ItemBrowser.js';
import { IconSearch } from '../lib/icons.js';

/**
 * Resultados de la búsqueda global. El campo no está aquí: es el de la barra
 * superior, que en esta ruta ocupa todo el ancho y se enfoca solo. Tener dos
 * buscadores en la misma pantalla era parte de lo que hacía confusa la interfaz.
 */
export function SearchRoute() {
  const [params] = useSearchParams();
  const query = params.get('q') ?? '';
  const baseQuery = useMemo(() => ({ q: query || undefined }), [query]);

  if (!query) {
    return (
      <>
        <div className="page-head">
          <div>
            <p className="eyebrow">Buscar</p>
            <h1>Buscar en la biblioteca</h1>
          </div>
        </div>
        <div className="state">
          <IconSearch />
          <strong>¿Qué quieres ver?</strong>
          <p>
            Escribe el título de una canción, un opening o el nombre de un archivo en la barra de arriba y pulsa Intro. La búsqueda ignora
            mayúsculas y acentos.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Buscar</p>
          <h1>Resultados para «{query}»</h1>
        </div>
      </div>

      <ItemBrowser
        baseQuery={baseQuery}
        showFilters={false}
        emptyTitle="Sin resultados"
        emptyDescription="Ningún archivo coincide con esa búsqueda. Prueba con menos palabras."
      />
    </>
  );
}
