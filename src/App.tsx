import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AppBar, BottomNav, Sidebar } from './components/Navigation.js';
import { ScanSheet } from './components/ScanSheet.js';
import { EmptyState } from './components/States.js';
import { ToastProvider } from './components/Toast.js';
import { LibraryProvider, useLibrary } from './data/LibraryProvider.js';
import { PlayerProvider, usePlayer } from './data/PlayerProvider.js';
import { PreferencesProvider } from './data/Preferences.js';
import { useAsync } from './data/useAsync.js';
import { useScan } from './data/useScan.js';
import { api, UNAUTHORIZED_EVENT } from './lib/api.js';
import { IconInbox } from './lib/icons.js';
import { CategoryRoute } from './routes/CategoryRoute.js';
import { ChannelRoute } from './routes/ChannelRoute.js';
import { FavoritesRoute } from './routes/FavoritesRoute.js';
import { HomeRoute } from './routes/HomeRoute.js';
import { LibraryRoute } from './routes/LibraryRoute.js';
import { LoginRoute } from './routes/LoginRoute.js';
import { SearchRoute } from './routes/SearchRoute.js';
import { SettingsRoute } from './routes/SettingsRoute.js';
import { WatchRoute } from './routes/WatchRoute.js';

/** Al cambiar de vista se vuelve arriba, como en cualquier aplicación. */
function ScrollToTop() {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  useEffect(() => {
    // Sólo al cambiar de ruta: al recargar se respeta la restauración del navegador.
    if (previous.current === pathname) return;
    previous.current = pathname;
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

function NotFoundRoute() {
  return (
    <EmptyState
      icon={<IconInbox />}
      title="Esta página no existe"
      description="Puede que el enlace esté mal escrito o que el archivo ya no esté en la biblioteca."
      action={
        <a className="btn btn-primary" href="/">
          Volver al inicio
        </a>
      }
    />
  );
}

function Shell() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const { bumpRevision, revision } = useLibrary();
  const { current } = usePlayer();
  const location = useLocation();
  const scan = useScan(bumpRevision);
  const categories = useAsync(() => api.categories(), [revision]);

  useEffect(() => {
    api.session().then(
      (result) => setAuthenticated(result.authenticated),
      () => setAuthenticated(false),
    );
  }, []);

  useEffect(() => {
    const onUnauthorized = () => setAuthenticated(false);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const playerMode = !current ? 'hidden' : location.pathname.startsWith('/ver/') ? 'full' : 'mini';

  if (authenticated === null) {
    return (
      <div className="login" aria-busy="true">
        <div className="login-card" style={{ alignItems: 'center' }}>
          <div className="skeleton" style={{ width: 160, height: 20 }} />
          <div className="skeleton" style={{ width: 220, height: 12 }} />
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <LoginRoute
        onSuccess={() => {
          setAuthenticated(true);
          bumpRevision();
        }}
      />
    );
  }

  return (
    <div className="app" data-player={playerMode}>
      <ScrollToTop />
      <AppBar onScan={() => void scan.start()} scanning={scan.scanning} />

      <div className="app-body">
        <Sidebar categories={categories.data?.categories ?? []} />
        <main className="content" id="contenido">
          <Routes>
            <Route path="/" element={<HomeRoute onScan={() => void scan.start()} scanning={scan.scanning} />} />
            <Route path="/biblioteca" element={<LibraryRoute />} />
            <Route path="/c/:category" element={<CategoryRoute />} />
            <Route path="/c/:category/:channel" element={<ChannelRoute onScan={() => void scan.start()} scanning={scan.scanning} />} />
            <Route path="/favoritos" element={<FavoritesRoute />} />
            <Route path="/buscar" element={<SearchRoute />} />
            <Route
              path="/ajustes"
              element={
                <SettingsRoute
                  onScan={() => void scan.start()}
                  scanning={scan.scanning}
                  onLogout={() => {
                    void api.logout().finally(() => setAuthenticated(false));
                  }}
                />
              }
            />
            <Route path="/ver/:id" element={<WatchRoute />} />
            <Route path="*" element={<NotFoundRoute />} />
          </Routes>
        </main>
      </div>

      <BottomNav />
      <ScanSheet open={scan.sheetOpen} status={scan.status} onClose={scan.closeSheet} onCancel={() => void scan.cancel()} />
    </div>
  );
}

export function App() {
  return (
    <PreferencesProvider>
      <ToastProvider>
        <LibraryProvider>
          <BrowserRouter>
            <PlayerProvider>
              <Shell />
            </PlayerProvider>
          </BrowserRouter>
        </LibraryProvider>
      </ToastProvider>
    </PreferencesProvider>
  );
}
