import { StrictMode, useEffect, useRef, useState, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { Gesture, MediaPlayer, MediaProvider, type MediaPlayerInstance } from '@vidstack/react';
import { DefaultAudioLayout, DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import '@vidstack/react/player/styles/default/layouts/audio.css';
import { computeGridCapacity } from './gridCapacity.js';
import './styles.css';

type Item = {
  id: number;
  category: string;
  channel: string;
  kind: 'audio' | 'video';
  title: string;
  cover: string | null;
  watched: boolean;
  position: number;
  watched_at: string | null;
  favorite: boolean;
  favorite_at: string | null;
  created_at: string | null;
  channelCover?: string | null;
  previews?: string[];
  extension?: string;
  url: string;
};

type Channel = { name: string; items: Item[]; watched: number; unwatched: number; preview: Item; latestCreatedAt: string };
type SortField = 'name' | 'created';
type SortDirection = 'asc' | 'desc';
type GallerySize = 'small' | 'medium' | 'large';

const APP_VERSION = '1.2.0';
const APP_NAME = 'MediaServer';

const gallerySizeSpec: Record<GallerySize, { label: string; width: number; height: number; gap: number }> = {
  small: { label: 'Pequeño', width: 140, height: 150, gap: 14 },
  medium: { label: 'Mediano', width: 190, height: 210, gap: 18 },
  large: { label: 'Grande', width: 260, height: 280, gap: 22 },
};
const channelCardSpec = { width: 230, height: 240 };

const api = async (url: string, options?: RequestInit) => {
  const headers = new Headers(options?.headers);
  if (options?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) throw new Error((await response.json()).error ?? 'Error');
  return response.json();
};

function applySort<T>(list: T[], field: SortField, direction: SortDirection, nameKey: (item: T) => string, createdKey: (item: T) => string): T[] {
  return [...list].sort((a, b) => {
    const left = field === 'name' ? nameKey(a) : createdKey(a);
    const right = field === 'name' ? nameKey(b) : createdKey(b);
    const compare = left < right ? -1 : left > right ? 1 : 0;
    return direction === 'asc' ? compare : -compare;
  });
}

function getMediaSource(item: Item): { src: string; type: 'video/mp4' } | { src: string; type: 'audio/mpeg' | 'audio/ogg' | 'audio/flac' } {
  if (item.kind === 'video') return { src: item.url, type: 'video/mp4' };

  switch (item.extension?.toLowerCase()) {
    case '.flac': return { src: item.url, type: 'audio/flac' };
    case '.ogg':
    case '.opus': return { src: item.url, type: 'audio/ogg' };
    default: return { src: item.url, type: 'audio/mpeg' };
  }
}

// Estima cuántos elementos caben en el contenedor visible para evitar paginación innecesaria.
function useGridCapacity(containerRef: RefObject<HTMLElement | null>, itemWidth: number, itemHeight: number, gap: number, bottomReserve: number, deps: unknown[]) {
  const [capacity, setCapacity] = useState(Infinity);
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const compute = () => {
      const width = element.clientWidth || itemWidth;
      const top = element.getBoundingClientRect().top;
      const minimumVisibleHeight = itemHeight * 3 + gap * 2;
      const availableHeight = Math.max(minimumVisibleHeight, window.innerHeight - top - bottomReserve);
      setCapacity(computeGridCapacity({ width, height: availableHeight, itemWidth, itemHeight, gap }));
    };
    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(element);
    window.addEventListener('resize', compute);
    return () => { observer.disconnect(); window.removeEventListener('resize', compute); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, itemWidth, itemHeight, gap, bottomReserve, ...deps]);
  return capacity;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  return <main className="login"><div><div className="login-brand"><span className="login-brand-icon">▶</span><span>Media Server</span></div><form onSubmit={async (event) => { event.preventDefault(); try { await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) }); onLogin(); } catch (err) { setError((err as Error).message); } }} autoComplete="on"><input id="username" name="username" aria-label="Usuario" placeholder="Usuario" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /><input id="password" name="password" aria-label="Contraseña" placeholder="Contraseña" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="submit">Entrar</button>{error && <small>{error}</small>}</form></div></main>;
}

function Artwork({ item, className = '', hovered = false, previewUrls = [] }: { item: Item; className?: string; hovered?: boolean; previewUrls?: string[] }) {
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    if (!(item.kind === 'video' && previewUrls.length > 0 && hovered)) {
      setPreviewIndex(0);
      return;
    }

    const interval = window.setInterval(() => {
      setPreviewIndex((current) => (current + 1) % previewUrls.length);
    }, 500);

    return () => window.clearInterval(interval);
  }, [hovered, item.kind, previewUrls.length]);

  if (item.kind === 'video' && previewUrls.length > 0 && hovered) {
    return <div className={`art ${item.kind} ${className}`}>
      <img src={previewUrls[previewIndex]} alt="" className="video-preview-image" />
    </div>;
  }

  return <div className={`art ${item.kind} ${className}`}>{item.cover ? <img src={item.cover} alt="" /> : <span>{item.kind === 'video' ? '▶' : '♫'}</span>}</div>;
}

function SortControls({ field, direction, onFieldChange, onDirectionChange }: { field: SortField; direction: SortDirection; onFieldChange: (field: SortField) => void; onDirectionChange: (direction: SortDirection) => void }) {
  return <div className="sort-controls">
    <label>Ordenar
      <select value={field} onChange={(event) => onFieldChange(event.target.value as SortField)}>
        <option value="name">Nombre</option>
        <option value="created">Fecha de creación</option>
      </select>
    </label>
    <button onClick={() => onDirectionChange(direction === 'asc' ? 'desc' : 'asc')} title={direction === 'asc' ? 'Ascendente' : 'Descendente'}>{direction === 'asc' ? '↑' : '↓'}</button>
  </div>;
}

function SizeControls({ size, onChange }: { size: GallerySize; onChange: (size: GallerySize) => void }) {
  return <div className="size-controls">{(Object.keys(gallerySizeSpec) as GallerySize[]).map((value) => <button key={value} className={size === value ? 'active' : ''} onClick={() => onChange(value)}>{gallerySizeSpec[value].label}</button>)}</div>;
}

function SearchControls({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label className="search-controls">
    <span>Buscar</span>
    <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Buscar archivos..." aria-label="Buscar archivos" />
  </label>;
}

function ScanProgressModal({ open, status, onClose }: { open: boolean; status: { running: boolean; processed: number; currentFile: string; message: string; startedAt: string | null; total: number } | null; onClose: () => void }) {
  if (!open || !status) return null;
  const isIdle = !status.running && (status.message === 'Sin escaneo activo' || !status.message);
  if (isIdle) return null;
  const progress = status.total > 0 ? Math.min(100, Math.round((status.processed / status.total) * 100)) : 0;
  return <div className="scan-modal-backdrop" onClick={onClose}><div className="scan-modal" role="dialog" aria-live="polite" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="scan-modal-header"><strong>Escaneando biblioteca</strong><div className="scan-modal-tools"><span>{status.running ? 'En curso' : 'Finalizado'}</span><button className="scan-close" onClick={onClose} aria-label="Cerrar diálogo">×</button></div></div><div className="scan-modal-progress"><div className="scan-modal-bar"><span style={{ width: `${progress}%` }} /></div><small>{status.processed} / {status.total || 0} archivos</small></div><p className="scan-modal-message">{status.message || 'Preparando escaneo...'}</p>{status.currentFile && <p className="scan-modal-file">Archivo: {status.currentFile}</p>}</div></div>;
}

function isRealMobileBrowser() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const desktopUA = /Windows NT|Macintosh|X11/i.test(ua);
  const touchDevice = navigator.maxTouchPoints > 0 && !desktopUA;
  return (mobileUA || touchDevice) && !desktopUA;
}

function App() {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [category, setCategory] = useState('latest');
  const [channel, setChannel] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'watched' | 'unwatched' | 'favorite'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [channelPage, setChannelPage] = useState(1);
  const [filePage, setFilePage] = useState(1);
  const [selected, setSelected] = useState<Item | null>(null);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [autoplay, setAutoplay] = useState(false);
  const [gallerySize, setGallerySize] = useState<GallerySize>('medium');
  const [scanStatus, setScanStatus] = useState<{ running: boolean; processed: number; currentFile: string; message: string; startedAt: string | null; total: number } | null>(null);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => isRealMobileBrowser());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scanModalClosedByUser = useRef(false);
  const channelGridRef = useRef<HTMLDivElement>(null);
  const fileGridRef = useRef<HTMLDivElement>(null);
  const load = () => api('/api/library?watched=all').then(setItems);

  useEffect(() => { api('/api/session').then((result) => setAuth(result.authenticated)); }, []);
  useEffect(() => { if (auth) load(); }, [auth]);
  useEffect(() => {
    if (!auth) return;
    const refreshStatus = async () => {
      try {
        const nextStatus = await api('/api/scan/status');
        const wasRunning = Boolean(scanStatus?.running);
        setScanStatus(nextStatus);
        const isActive = Boolean(nextStatus?.running || nextStatus?.message?.startsWith('Iniciando') || nextStatus?.message?.startsWith('Procesando') || nextStatus?.currentFile);
        if (!isActive) {
          setScanModalOpen(false);
          scanModalClosedByUser.current = false;
          if (wasRunning || nextStatus?.message?.startsWith('Escaneo completado') || nextStatus?.message?.startsWith('Error al escanear')) {
            await load();
          }
          return;
        }
        setScanModalOpen(!scanModalClosedByUser.current);
      } catch {
        setScanStatus(null);
        setScanModalOpen(false);
        scanModalClosedByUser.current = false;
      }
    };
    void refreshStatus();
    if (!scanStatus?.running && !scanModalOpen) return;
    const interval = window.setInterval(() => { void refreshStatus(); }, 1000);
    return () => window.clearInterval(interval);
  }, [auth, scanStatus?.running, scanModalOpen]);
  useEffect(() => { setChannelPage(1); setFilePage(1); setChannel(null); setFilter('all'); setSearchTerm(''); }, [category]);
  useEffect(() => { setFilePage(1); }, [channel, filter, sortField, sortDirection, gallerySize, searchTerm]);
  useEffect(() => { setChannelPage(1); }, [sortField, sortDirection]);
  useEffect(() => { document.body.style.overflow = selected ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [selected]);
  useEffect(() => {
    if (!isMobile) setSidebarOpen(false);
  }, [isMobile]);
  useEffect(() => { if (!isMobile) setSidebarOpen(false); }, [isMobile]);

  const channelCapacity = useGridCapacity(channelGridRef, channelCardSpec.width, channelCardSpec.height, 20, 90, [category, channel]);
  const fileSpec = gallerySizeSpec[gallerySize];
  const fileCapacity = useGridCapacity(fileGridRef, fileSpec.width, fileSpec.height, fileSpec.gap, 90, [category, channel, filter, gallerySize]);

  if (auth === null) return null;
  if (!auth) return <Login onLogin={() => setAuth(true)} />;

  const categoryNames = [...new Set(items.map((item) => item.category))];
  const latest = items.filter((item) => item.watched).sort((a, b) => (b.watched_at ?? '').localeCompare(a.watched_at ?? ''));
  const favoriteItems = items.filter((item) => item.favorite);
  const categoryItems = category === 'latest' ? latest : category === 'favorites' ? favoriteItems : items.filter((item) => item.category === category);
  const rawChannels: Channel[] = [...new Set(categoryItems.map((item) => item.channel))].map((name) => {
    const channelItems = categoryItems.filter((item) => item.channel === name);
    const latestCreatedAt = channelItems.reduce((max, entry) => (entry.created_at && entry.created_at > max ? entry.created_at : max), '');
    const channelPreview = channelItems.find((item) => item.channelCover) ?? channelItems[0];
    return {
      name,
      items: channelItems,
      watched: channelItems.filter((item) => item.watched).length,
      unwatched: channelItems.filter((item) => !item.watched).length,
      preview: channelPreview ? { ...channelPreview, cover: channelPreview.channelCover ?? channelPreview.cover } : channelItems[0],
      latestCreatedAt,
    };
  });
  const channels = category === 'latest' ? rawChannels : applySort(rawChannels, sortField, sortDirection, (entry) => entry.name.toLocaleLowerCase(), (entry) => entry.latestCreatedAt);
  const selectedChannel = channel ? rawChannels.find((entry) => entry.name === channel) : null;
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const unsortedChannelItems = selectedChannel?.items.filter((item) => {
    if (filter === 'favorite') return item.favorite;
    if (filter === 'all') return true;
    return filter === 'watched' ? item.watched : !item.watched;
  }) ?? [];
  const searchedChannelItems = normalizedSearch
    ? unsortedChannelItems.filter((item) => item.title.toLowerCase().includes(normalizedSearch))
    : unsortedChannelItems;
  const channelItems = applySort(searchedChannelItems, sortField, sortDirection, (item) => item.title.toLocaleLowerCase(), (item) => item.created_at ?? '');
  const favoriteSearchItems = normalizedSearch ? favoriteItems.filter((item) => item.title.toLowerCase().includes(normalizedSearch)) : favoriteItems;
  const favoriteItemsSorted = applySort(favoriteSearchItems, sortField, sortDirection, (item) => item.title.toLocaleLowerCase(), (item) => item.created_at ?? '');

  const channelPageSize = Math.max(1, channelCapacity);
  const channelPages = Math.max(1, Math.ceil(channels.length / channelPageSize));
  const safeChannelPage = Math.min(channelPage, channelPages);
  const pagedChannels = channelPages > 1 ? channels.slice((safeChannelPage - 1) * channelPageSize, safeChannelPage * channelPageSize) : channels;

  const filePageSize = Math.max(1, fileCapacity);
  const filePages = Math.max(1, Math.ceil(channelItems.length / filePageSize));
  const safeFilePage = Math.min(filePage, filePages);
  const pageItems = filePages > 1 ? channelItems.slice((safeFilePage - 1) * filePageSize, safeFilePage * filePageSize) : channelItems;
  const favoritePageSize = Math.max(1, fileCapacity);
  const favoritePages = Math.max(1, Math.ceil(favoriteItemsSorted.length / favoritePageSize));
  const safeFavoritePage = Math.min(filePage, favoritePages);
  const favoritePageItems = favoritePages > 1 ? favoriteItemsSorted.slice((safeFavoritePage - 1) * favoritePageSize, safeFavoritePage * favoritePageSize) : favoriteItemsSorted;

  const selectedSequence = selected ? applySort(items.filter((item) => item.channel === selected.channel), sortField, sortDirection, (item) => item.title.toLocaleLowerCase(), (item) => item.created_at ?? '') : [];
  const selectedIndex = selected ? selectedSequence.findIndex((item) => item.id === selected.id) : -1;
  const recommendations = selectedIndex >= 0 ? selectedSequence.slice(selectedIndex + 1, selectedIndex + 11) : [];

  const chooseCategory = (name: string) => { setCategory(name); setChannel(null); setChannelPage(1); setFilter(name === 'favorites' ? 'favorite' : 'all'); };
  const scan = async () => {
    const optimisticStatus = {
      running: true,
      processed: 0,
      currentFile: '',
      message: 'Iniciando escaneo de la biblioteca...',
      startedAt: new Date().toISOString(),
      total: 0,
    };
    scanModalClosedByUser.current = false;
    setScanStatus(optimisticStatus);
    setScanModalOpen(true);
    try {
      await api('/api/scan', { method: 'POST' });
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar el escaneo';
      setScanStatus({ running: false, processed: 0, currentFile: '', message, startedAt: null, total: 0 });
      setScanModalOpen(false);
    }
  };

  return <main className={`app-shell ${isMobile ? 'is-mobile' : ''}`}>
    <header className="topbar">
      {isMobile && <button className="mobile-sidebar-toggle" onClick={() => setSidebarOpen((current) => !current)} aria-label="Toggle sidebar">☰</button>}
      <button className="brand" onClick={() => chooseCategory('latest')}><span className="brand-mark">M</span><span><b>{APP_NAME}</b><small>SERVER</small></span></button>
      <div className="top-actions"><button onClick={scan}>↻ <span>Escanear</span></button><button className="quiet" onClick={() => api('/api/logout', { method: 'POST' }).then(() => setAuth(false))}>Salir</button></div>
    </header>
    <ScanProgressModal open={scanModalOpen} status={scanStatus} onClose={() => { scanModalClosedByUser.current = true; setScanModalOpen(false); }} />
    {isMobile && sidebarOpen && <button className="sidebar-backdrop" aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)} />}
    <div className="app-body">
      <aside className={`sidebar ${isMobile ? (sidebarOpen ? 'mobile-open' : 'mobile-closed') : ''}`}>
        <div className="side-heading">Biblioteca</div>
        <button className={`side-link ${category === 'latest' ? 'active' : ''}`} onClick={() => { chooseCategory('latest'); setSidebarOpen(false); }}><span>◷</span><span>Últimos vistos</span><b>{latest.length}</b></button>
        <button className={`side-link ${category === 'favorites' ? 'active' : ''}`} onClick={() => { chooseCategory('favorites'); setSidebarOpen(false); }}><span>♥</span><span>Favoritos</span><b>{favoriteItems.length}</b></button>
        <div className="side-heading category-heading">Categorías</div>{categoryNames.map((name) => <button className={`side-link ${category === name ? 'active' : ''}`} key={name} onClick={() => { chooseCategory(name); setSidebarOpen(false); }}><span className="category-dot" /><span>{name}</span><b>{items.filter((item) => item.category === name).length}</b></button>)}
        <div className="sidebar-version">v{APP_VERSION}</div>
      </aside>
      <section className="content">
        {!channel ? <>
          <div className="content-heading"><div><p className="eyebrow">{category === 'latest' ? 'TU ACTIVIDAD' : category === 'favorites' ? 'SELECCIÓN' : 'CATEGORÍA'}</p><h1>{category === 'latest' ? 'Últimos vistos' : category === 'favorites' ? 'Favoritos' : category}</h1></div>{category === 'latest' && <span className="heading-count">{latest.length} archivos</span>}{category === 'favorites' && <span className="heading-count">{favoriteItems.length} archivos</span>}</div>
          {category === 'latest' ? <FileGrid items={latest} onSelect={setSelected} onFavoriteChange={(updatedItem) => { setItems((current) => current.map((item) => item.id === updatedItem.id ? updatedItem : item)); if (selected?.id === updatedItem.id) setSelected(updatedItem); }} empty="Todavía no has visto ningún archivo." size={gallerySize} gridRef={fileGridRef} /> : category === 'favorites' ? <>
            <div className="filter-bar"><span>{favoriteItemsSorted.length} archivos</span><div className="filter-controls"><SearchControls value={searchTerm} onChange={setSearchTerm} /><SortControls field={sortField} direction={sortDirection} onFieldChange={setSortField} onDirectionChange={setSortDirection} /><SizeControls size={gallerySize} onChange={setGallerySize} /><button className="active" onClick={() => setFilter('favorite')}>Favoritos</button></div></div>
            <FileGrid items={favoritePageItems} onSelect={setSelected} onFavoriteChange={(updatedItem) => { setItems((current) => current.map((item) => item.id === updatedItem.id ? updatedItem : item)); if (selected?.id === updatedItem.id) setSelected(updatedItem); }} empty="Todavía no tienes archivos favoritos." size={gallerySize} gridRef={fileGridRef} />
            <Pagination page={safeFavoritePage} pages={favoritePages} onChange={setFilePage} />
          </> : <>
            <div className="section-intro"><h2>Canales</h2><span>{channels.length} canales</span><SortControls field={sortField} direction={sortDirection} onFieldChange={setSortField} onDirectionChange={setSortDirection} /></div>
            <div className="channel-grid" ref={channelGridRef}>{pagedChannels.map((entry) => <button className="channel-card" key={entry.name} onClick={() => { setChannel(entry.name); setFilePage(1); }}><Artwork item={entry.preview} className="channel-art" /><div className="channel-card-body"><strong>{entry.name}</strong><small>{entry.items.length} archivos</small><div className="channel-counts"><span className="seen">{entry.watched} vistos</span><span>{entry.unwatched} por ver</span></div></div></button>)}</div>
            {channels.length === 0 && <Empty text="Esta categoría todavía no tiene archivos." />}
            <Pagination page={safeChannelPage} pages={channelPages} onChange={setChannelPage} />
          </>}
        </> : <>
          <div className="channel-header"><button className="back-button" onClick={() => setChannel(null)}>←</button><div><p className="eyebrow">CANAL</p><h1>{channel}</h1></div><div className="channel-total"><b>{selectedChannel?.watched ?? 0}</b> vistos <b>{selectedChannel?.unwatched ?? 0}</b> por ver</div></div>
          <div className="filter-bar"><span>{channelItems.length} archivos</span><div className="filter-controls"><SearchControls value={searchTerm} onChange={setSearchTerm} /><SortControls field={sortField} direction={sortDirection} onFieldChange={setSortField} onDirectionChange={setSortDirection} /><SizeControls size={gallerySize} onChange={setGallerySize} />{(['all', 'unwatched', 'watched', 'favorite'] as const).map((value) => <button className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)}>{value === 'all' ? 'Todos' : value === 'unwatched' ? 'Por ver' : value === 'watched' ? 'Vistos' : 'Favoritos'}</button>)}</div></div>
          <FileGrid items={pageItems} onSelect={setSelected} onFavoriteChange={(updatedItem) => { setItems((current) => current.map((item) => item.id === updatedItem.id ? updatedItem : item)); if (selected?.id === updatedItem.id) setSelected(updatedItem); }} empty="No hay archivos con este filtro." size={gallerySize} gridRef={fileGridRef} />
          <Pagination page={safeFilePage} pages={filePages} onChange={setFilePage} />
        </>}
      </section>
    </div>
    {selected && <IntegratedPlayer key={selected.id} item={selected} recommendations={recommendations} autoplay={autoplay} onAutoplayChange={setAutoplay} onSelect={setSelected} onClose={() => setSelected(null)} onChanged={(watched) => { setItems((current) => current.map((item) => item.id === selected.id ? { ...item, watched } : item)); setSelected((current) => current ? { ...current, watched } : current); }} onFavoriteToggle={(favorite) => { setItems((current) => current.map((item) => item.id === selected.id ? { ...item, favorite } : item)); setSelected((current) => current ? { ...current, favorite } : current); }} />}
  </main>;
}

function FileCard({ item, onSelect, onFavoriteChange }: { item: Item; onSelect: (item: Item) => void; onFavoriteChange: (item: Item) => void }) {
  const [hovered, setHovered] = useState(false);
  const [favorite, setFavorite] = useState(item.favorite);
  const previewUrls = item.kind === 'video' ? (item.previews ?? []) : [];
  const toggleFavorite = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nextFavorite = !favorite;
    setFavorite(nextFavorite);
    void api(`/api/items/${item.id}/favorite`, { method: 'POST', body: JSON.stringify({ favorite: nextFavorite }) }).then((result) => {
      const updatedItem = { ...item, favorite: Boolean(result.favorite) };
      onFavoriteChange(updatedItem);
    }).catch(() => setFavorite(favorite));
  };

  return <div className={`file-card ${item.watched ? 'watched' : ''}`} key={item.id} onClick={() => onSelect(item)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
    <Artwork item={{ ...item, favorite }} hovered={hovered} previewUrls={previewUrls} />
    <button type="button" className={`favorite-button ${favorite ? 'active' : ''}`} aria-label={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'} onClick={toggleFavorite}>♥</button>
    <strong>{item.title}</strong>
    {item.watched && <b className="watched-label">VISTO</b>}
  </div>;
}

function FileGrid({ items, onSelect, onFavoriteChange, empty, size, gridRef }: { items: Item[]; onSelect: (item: Item) => void; onFavoriteChange: (item: Item) => void; empty: string; size: GallerySize; gridRef?: RefObject<HTMLDivElement | null> }) {
  if (items.length === 0) return <Empty text={empty} />;
  return <div className={`file-grid size-${size}`} ref={gridRef}>{items.map((item) => <FileCard key={item.id} item={item} onSelect={onSelect} onFavoriteChange={onFavoriteChange} />)}</div>;
}

function IntegratedPlayer({ item, recommendations, autoplay, onAutoplayChange, onSelect, onClose, onChanged, onFavoriteToggle }: { item: Item; recommendations: Item[]; autoplay: boolean; onAutoplayChange: (value: boolean) => void; onSelect: (item: Item) => void; onClose: () => void; onChanged: (watched: boolean) => void; onFavoriteToggle: (favorite: boolean) => void }) {
  const playerRef = useRef<MediaPlayerInstance>(null);
  const autoplayRef = useRef(autoplay);
  const recommendationsRef = useRef(recommendations);
  const selectRef = useRef(onSelect);
  const [isMobile] = useState(() => isRealMobileBrowser());
  autoplayRef.current = autoplay;
  recommendationsRef.current = recommendations;
  selectRef.current = onSelect;

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    let autoMarked = false;
    let lastSaved = 0;
    let restored = false;
    const savePosition = (position: number) => {
      if (!Number.isFinite(position) || position <= 0) return;
      lastSaved = position;
      void api(`/api/items/${item.id}/progress`, { method: 'POST', body: JSON.stringify({ position }) });
    };
    const restorePosition = () => {
      const position = Number(item.position);
      if (restored || !Number.isFinite(position) || position <= 0 || player.duration <= position) return;
      player.currentTime = position;
      restored = true;
    };
    const unsubscribe = player.subscribe(({ currentTime, duration }) => {
      if (currentTime - lastSaved >= 4) {
        savePosition(currentTime);
      }
      if (!autoMarked && duration > 0 && currentTime / duration >= 0.9) {
        autoMarked = true;
        void api(`/api/items/${item.id}/watched`, { method: 'POST', body: JSON.stringify({ watched: true }) }).then(() => onChanged(true));
      }
    });
    const handlePause = () => savePosition(player.currentTime);
    player.addEventListener('loaded-metadata', restorePosition);
    player.addEventListener('can-play', restorePosition);
    player.addEventListener('pause', handlePause);
    const handleEnded = () => { const next = autoplayRef.current ? recommendationsRef.current[0] : undefined; if (next) selectRef.current(next); };
    player.addEventListener('ended', handleEnded);
    restorePosition();
    return () => {
      savePosition(player.currentTime);
      unsubscribe();
      player.removeEventListener('loaded-metadata', restorePosition);
      player.removeEventListener('can-play', restorePosition);
      player.removeEventListener('pause', handlePause);
      player.removeEventListener('ended', handleEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const toggleWatched = () => api(`/api/items/${item.id}/watched`, { method: 'POST', body: JSON.stringify({ watched: !item.watched }) }).then((result) => onChanged(result.watched));
  const toggleFavorite = () => api(`/api/items/${item.id}/favorite`, { method: 'POST', body: JSON.stringify({ favorite: !item.favorite }) }).then((result) => onFavoriteToggle(result.favorite));
  const mediaSource = getMediaSource(item);
  const showRecommendations = !isMobile;

  return <div className={`player ${isMobile ? 'is-mobile' : ''}`} onClick={onClose}><div className={`player-frame integrated-player-frame ${item.kind === 'audio' ? 'audio-mode' : 'video-mode'} ${isMobile ? 'mobile-player' : ''}`} onClick={(event) => event.stopPropagation()}><button className="close player-close" onClick={onClose} aria-label="Cerrar reproductor">×</button><div className="player-main"><div className={`media-stage ${item.kind === 'audio' ? 'audio-stage' : ''}`}>
    {item.kind === 'audio' && <div className="audio-visual">{item.cover ? <img src={item.cover} alt="" /> : <span>MEDIA</span>}</div>}
    <MediaPlayer ref={playerRef} className={`${item.kind === 'video' ? 'vidstack-video' : 'vidstack-audio'} ${isMobile ? 'mobile-media-player' : ''}`} title={item.title} src={mediaSource} viewType={item.kind} poster={item.kind === 'video' ? item.cover ?? undefined : undefined} autoPlay playsInline style={{ touchAction: 'manipulation' }}>
      <MediaProvider />
      {item.kind === 'video' ? <DefaultVideoLayout icons={defaultLayoutIcons} /> : <DefaultAudioLayout icons={defaultLayoutIcons} />}
      {isMobile && item.kind === 'video' && <><Gesture event="dblpointerup" action="seek:-10" /><Gesture event="dblpointerup" action="seek:10" /></>}
    </MediaPlayer>
  </div><div className="player-meta"><div className="player-title"><h2>{item.title}</h2><span className="player-channel">◉ {item.channel}</span></div><div className="player-actions"><label className="autoplay-toggle"><input type="checkbox" checked={autoplay} onChange={(event) => onAutoplayChange(event.target.checked)} /> AutoPlay</label><button className={`favorite-toggle ${item.favorite ? 'is-favorite' : ''}`} onClick={toggleFavorite} aria-label={item.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}>♥</button><button className={`watch-toggle ${item.watched ? 'is-watched' : ''}`} onClick={toggleWatched}><span>{item.watched ? '✓' : '○'}</span>{item.watched ? 'Visto' : 'No visto'}</button></div></div></div>{showRecommendations && <aside className="recommendations"><div className="recommendation-heading"><b>Siguiente</b><button className="close recommendation-close" onClick={onClose}>×</button></div><div className="recommendation-list">{recommendations.length === 0 ? <p className="recommendation-empty">No hay más archivos en este canal.</p> : recommendations.map((recommendation) => <button className="recommendation" key={recommendation.id} onClick={() => onSelect(recommendation)}><Artwork item={recommendation} /><span><strong>{recommendation.title}</strong><small>{recommendation.watched ? 'Visto' : recommendation.channel}</small></span></button>)}</div></aside>}</div></div>;
}

function Empty({ text }: { text: string }) { return <div className="empty"><span>○</span><p>{text}</p></div>; }
function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) { if (pages <= 1) return null; return <div className="pagination"><button disabled={page === 1} onClick={() => onChange(page - 1)}>←</button><span>Página {page} de {pages}</span><button disabled={page === pages} onClick={() => onChange(page + 1)}>→</button></div>; }

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
