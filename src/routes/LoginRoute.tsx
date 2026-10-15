import { type FormEvent, useState } from 'react';
import { api } from '../lib/api.js';
import { IconAlert } from '../lib/icons.js';

export function LoginRoute({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(username, password);
      onSuccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <div className="login-card">
        <div className="login-brand">
          <span className="mark" aria-hidden="true">
            M
          </span>
          <div>
            <h1>MediaServer</h1>
            <small>Biblioteca privada</small>
          </div>
        </div>

        <form onSubmit={submit} autoComplete="on">
          <div className="field">
            <label className="sr-only" htmlFor="username">
              Usuario
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="Usuario"
              value={username}
              // biome-ignore lint/a11y/noAutofocus: es la única pantalla y el primer campo útil.
              autoFocus
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="sr-only" htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Contraseña"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error && (
            <p className="login-error" role="alert">
              <IconAlert />
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !username || !password}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  );
}
