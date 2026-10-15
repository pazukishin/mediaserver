import { useEffect, useId, useRef } from 'react';
import { IconClose, IconSearch } from '../lib/icons.js';

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Nombre accesible del campo. Debe ser único si hay varios en la pantalla. */
  label?: string;
  autoFocus?: boolean;
  /** Se llama al confirmar con Intro. */
  onSubmit?: () => void;
};

export function SearchField({
  value,
  onChange,
  placeholder = 'Buscar en la biblioteca…',
  label = 'Buscar',
  autoFocus = false,
  onSubmit,
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Identificador único: la barra superior y la página de búsqueda pueden
  // convivir en la misma pantalla y no pueden compartir `id`.
  const inputId = useId();

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: el elemento `<search>` no es un formulario y aquí hace falta `onSubmit`; `role="search"` sobre un `<form>` es el patrón ARIA documentado.
    <form
      className="field field-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <IconSearch />
      <label className="sr-only" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="search"
        value={value}
        enterKeyHint="search"
        autoComplete="off"
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button
          type="button"
          className="icon-btn"
          style={{ width: 28, height: 28 }}
          aria-label="Limpiar búsqueda"
          onClick={() => onChange('')}
        >
          <IconClose />
        </button>
      )}
    </form>
  );
}
