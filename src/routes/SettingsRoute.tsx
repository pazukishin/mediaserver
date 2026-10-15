import { useState } from 'react';
import { SegmentedControl } from '../components/SegmentedControl.js';
import { Sheet } from '../components/Sheet.js';
import { useToast } from '../components/Toast.js';
import { useLibrary } from '../data/LibraryProvider.js';
import { usePreferences } from '../data/Preferences.js';
import { useAsync } from '../data/useAsync.js';
import { api } from '../lib/api.js';
import { formatRelative } from '../lib/format.js';
import { IconMonitor, IconMoon, IconRefresh, IconSun, IconTrash } from '../lib/icons.js';
import type { CardSize, ResetScope, ThemePreference } from '../lib/types.js';

const THEMES: Array<{ value: ThemePreference; label: string; Icon: typeof IconSun }> = [
  { value: 'system', label: 'Sistema', Icon: IconMonitor },
  { value: 'dark', label: 'Oscuro', Icon: IconMoon },
  { value: 'light', label: 'Claro', Icon: IconSun },
];

const SIZE_OPTIONS: ReadonlyArray<{ value: CardSize; label: string }> = [
  { value: 'compact', label: 'Pequeñas' },
  { value: 'cozy', label: 'Medianas' },
  { value: 'roomy', label: 'Grandes' },
];

const RESET_LABELS: Record<ResetScope, string> = {
  progress: 'Reiniciar el progreso de reproducción',
  watched: 'Quitar todas las marcas de visto',
  favorite: 'Quitar todos los favoritos',
  all: 'Borrar todo el estado de reproducción',
};

export function SettingsRoute({ onScan, scanning, onLogout }: { onScan: () => void; scanning: boolean; onLogout: () => void }) {
  const { theme, setTheme, cardSize, setCardSize, autoplay, setAutoplay } = usePreferences();
  const { bumpRevision } = useLibrary();
  const { notify } = useToast();
  const health = useAsync(() => api.health(), []);
  const scanStatus = useAsync(() => api.scanStatus(), [scanning]);
  const [confirmScope, setConfirmScope] = useState<ResetScope | null>(null);
  const [busy, setBusy] = useState(false);

  const runReset = async (scope: ResetScope) => {
    setBusy(true);
    try {
      const result = await api.reset(scope);
      notify(`${RESET_LABELS[scope]}: ${result.affected} ${result.affected === 1 ? 'archivo afectado' : 'archivos afectados'}`);
      bumpRevision();
      setConfirmScope(null);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'No se pudo completar la operación');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Configuración</p>
          <h1>Ajustes</h1>
        </div>
      </div>

      <div className="settings-grid">
        <section className="card-panel" aria-labelledby="ajustes-aspecto">
          <h2 id="ajustes-aspecto" style={{ fontSize: 'var(--fs-md)', marginBottom: 'var(--s-3)' }}>
            Aspecto
          </h2>

          <div className="switch">
            <span className="switch-label">
              <span>Tema</span>
              <small>Se guarda en este navegador</small>
            </span>
          </div>
          <SegmentedControl
            label="Tema"
            value={theme}
            onChange={setTheme}
            options={THEMES.map(({ value, label, Icon }) => ({
              value,
              label: (
                <>
                  <Icon size={16} />
                  <span>{label}</span>
                </>
              ),
            }))}
          />

          <div className="switch" style={{ marginTop: 'var(--s-4)' }}>
            <span className="switch-label">
              <span>Tamaño de las tarjetas</span>
              <small>También se cambia desde la barra de cada lista</small>
            </span>
          </div>
          <SegmentedControl label="Tamaño de las tarjetas" value={cardSize} onChange={setCardSize} options={SIZE_OPTIONS} />
        </section>

        <section className="card-panel" aria-labelledby="ajustes-reproduccion">
          <h2 id="ajustes-reproduccion" style={{ fontSize: 'var(--fs-md)', marginBottom: 'var(--s-3)' }}>
            Reproducción
          </h2>
          <label className="switch">
            <span className="switch-label">
              <span>Reproducción automática</span>
              <small>Al terminar un archivo, sigue con el siguiente del canal</small>
            </span>
            <input type="checkbox" checked={autoplay} onChange={(event) => setAutoplay(event.target.checked)} />
          </label>
        </section>

        <section className="card-panel" aria-labelledby="ajustes-biblioteca">
          <h2 id="ajustes-biblioteca" style={{ fontSize: 'var(--fs-md)', marginBottom: 'var(--s-3)' }}>
            Biblioteca
          </h2>
          <button type="button" className="btn btn-primary" onClick={onScan} disabled={scanning}>
            <IconRefresh className={scanning ? 'spin' : undefined} />
            {scanning ? 'Escaneando…' : 'Escanear ahora'}
          </button>
          {scanStatus.data?.finishedAt && (
            <p className="sub" style={{ marginTop: 'var(--s-3)' }}>
              Último escaneo: {formatRelative(scanStatus.data.finishedAt)} · {scanStatus.data.processed} archivos
            </p>
          )}
          {health.data && (
            <dl className="sub" style={{ marginTop: 'var(--s-3)', display: 'grid', gap: 4 }}>
              <div>
                Carpeta de medios: <code>{health.data.media.dir}</code> {health.data.media.readable ? '' : '(no legible)'}
              </div>
              <div>Archivos catalogados: {health.data.items}</div>
              <div>FFmpeg: {health.data.ffmpeg ? 'disponible' : 'no encontrado (sin miniaturas ni duración)'}</div>
              <div>Versión del servidor: {health.data.version}</div>
            </dl>
          )}
        </section>

        <section className="card-panel danger-zone" aria-labelledby="ajustes-peligro">
          <h2 id="ajustes-peligro" style={{ fontSize: 'var(--fs-md)', marginBottom: 'var(--s-3)' }}>
            Zona con cuidado
          </h2>
          <p className="sub" style={{ marginBottom: 'var(--s-3)' }}>
            Estas acciones no borran ningún archivo de la biblioteca: sólo el estado guardado en la base de datos.
          </p>
          <div className="stack" style={{ gap: 'var(--s-2)' }}>
            {(['progress', 'watched', 'favorite'] as const).map((scope) => (
              <button key={scope} type="button" className="btn btn-danger" onClick={() => setConfirmScope(scope)}>
                <IconTrash />
                {RESET_LABELS[scope]}
              </button>
            ))}
          </div>

          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: 'var(--s-4) 0' }} />

          <button type="button" className="btn btn-ghost btn-block" onClick={onLogout}>
            Cerrar sesión
          </button>
        </section>
      </div>

      <Sheet
        open={confirmScope !== null}
        title="¿Seguro?"
        description={confirmScope ? RESET_LABELS[confirmScope] : ''}
        onClose={() => setConfirmScope(null)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmScope(null)}>
              Cancelar
            </button>
            <button type="button" className="btn btn-danger" disabled={busy} onClick={() => confirmScope && void runReset(confirmScope)}>
              {busy ? 'Aplicando…' : 'Sí, continuar'}
            </button>
          </>
        }
      >
        <p className="sub">
          No se puede deshacer. Tu biblioteca de archivos no se toca: sólo se reinicia el estado de reproducción guardado
          {confirmScope === 'favorite' ? ' (favoritos)' : ''}.
        </p>
      </Sheet>
    </>
  );
}
