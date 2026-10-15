import type { ReactNode } from 'react';

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Nombre accesible cuando el texto visible no se explica solo (p. ej. «S»). */
  ariaLabel?: string;
};

type SegmentedControlProps<T extends string> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Nombre accesible del grupo completo. */
  label: string;
  className?: string;
};

/**
 * Grupo de botones con estado (tamaño de tarjetas, tema…). Se usa `role="group"`
 * con `aria-pressed` en cada botón: es el patrón ARIA para un selector de opción
 * única sin formulario, y mantiene la navegación con Tab normal.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, label, className }: SegmentedControlProps<T>) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: no es un formulario; `<fieldset>` exigiría un `<legend>` visible y semántica de envío que aquí no aplica.
    <div className={className ? `segmented ${className}` : 'segmented'} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          aria-label={option.ariaLabel}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
