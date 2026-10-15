type ProgressBarProps = {
  /** 0..1 */
  value: number;
  label?: string;
  className?: string;
};

/** Barra de progreso accesible y discreta (3px). */
export function ProgressBar({ value, label, className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div
      className={className ? `progress ${className}` : 'progress'}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-label={label ?? 'Progreso de reproducción'}
    >
      <span style={{ width: `${clamped * 100}%` }} />
    </div>
  );
}
