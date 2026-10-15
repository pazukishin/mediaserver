import type { CategorySummary, ChannelSummary, Health, HomeData, Item, ItemPage, ItemQuery, ResetScope, ScanStatus } from './types.js';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Se dispara cuando el servidor responde 401, para volver al login sin recargar. */
export const UNAUTHORIZED_EVENT = 'mediaserver:unauthorized';

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'No se pudo contactar con el servidor. Comprueba la conexión.');
  }

  if (response.status === 401 && !path.startsWith('/api/auth/')) {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    throw new ApiError(401, 'La sesión ha caducado. Vuelve a entrar.');
  }

  if (!response.ok) {
    let message = `Error ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* respuesta sin JSON: nos quedamos con el mensaje genérico */
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  health: () => request<Health>('/api/health'),
  session: () => request<{ authenticated: boolean; version: string }>('/api/session'),
  login: (username: string, password: string) => post<{ ok: true }>('/api/auth/login', { username, password }),
  logout: () => post<{ ok: true }>('/api/auth/logout'),

  home: () => request<HomeData>('/api/home'),
  categories: () => request<{ categories: CategorySummary[] }>('/api/categories'),
  channels: (category?: string) => request<{ channels: ChannelSummary[] }>(`/api/channels${buildQuery({ category })}`),
  items: (query: ItemQuery = {}) =>
    request<ItemPage>(
      `/api/items${buildQuery({
        category: query.category,
        channel: query.channel,
        q: query.q,
        filter: query.filter,
        sort: query.sort,
        dir: query.dir,
        offset: query.offset,
        limit: query.limit,
      })}`,
    ),
  item: (id: number) => request<Item>(`/api/items/${id}`),
  queue: (id: number) => request<{ ids: number[] }>(`/api/items/${id}/queue`),

  progress: (id: number, position: number, duration?: number) =>
    post<{ position: number; progress: number; watched: boolean }>(`/api/items/${id}/progress`, { position, duration }),
  watched: (id: number, watched: boolean) =>
    post<{ watched: boolean; watchedAt: string | null; position: number }>(`/api/items/${id}/watched`, { watched }),
  favorite: (id: number, favorite: boolean) =>
    post<{ favorite: boolean; favoriteAt: string | null }>(`/api/items/${id}/favorite`, { favorite }),
  reset: (scope: ResetScope) => post<{ ok: true; affected: number }>('/api/state/reset', { scope }),

  scan: () => post<{ accepted: true; startedAt: string }>('/api/scan'),
  scanStatus: () => request<ScanStatus>('/api/scan/status'),
  cancelScan: () => post<{ accepted: boolean }>('/api/scan/cancel'),
};

/** URL de una imagen, versionada por fecha para poder cachear de forma agresiva. */
export function versioned(url: string | null, stamp: string | null | undefined): string | null {
  if (!url) return null;
  if (!stamp) return url;
  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(stamp)}`;
}
