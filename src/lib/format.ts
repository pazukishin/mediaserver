/** Formateo de cifras para la interfaz. Todo en español. */

/** "1:23:45" o "12:34". Devuelve "" si no hay duración conocida. */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Duración legible: "1 h 12 min", "12 min", "45 s". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Tiempo restante de reproducción a partir de la posición. */
export function formatRemaining(position: number, duration: number): string {
  if (!Number.isFinite(duration) || duration <= 0) return '';
  const left = Math.max(0, duration - position);
  const formatted = formatDuration(left);
  return formatted ? `Quedan ${formatted}` : '';
}

/** "hace 3 días", "hoy", "ayer". */
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = now.getTime() - date.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'hace 1 semana' : `hace ${weeks} semanas`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? 'hace 1 mes' : `hace ${months} meses`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? 'hace 1 año' : `hace ${years} años`;
}

/** "1 archivo" / "12 archivos", con plural explícito cuando no es regular. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Porcentaje acotado 0..1 → "42 %". */
export function formatPercent(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  return `${Math.round(clamped * 100)} %`;
}
