const DEFAULT_API_BASE = 'http://localhost:3000';

// Configurable via VITE_API_BASE_URL (see frontend/.env.example) so the
// frontend can point at a backend that isn't on localhost:3000 — any real
// deployment. Falls back to the local dev default when unset.
export const API_BASE = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE;

const TOKEN_KEY = 'sqlstudio_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (response.status === 401 && !path.startsWith('/api/auth/')) {
    clearToken();
    if (window.location.pathname !== '/login') {
      window.location.assign('/login');
    }
  }

  return response;
}

export function getTerminalWsUrl(): string {
  // Derived from API_BASE (rather than window.location) so this stays
  // correct wherever the backend is actually hosted, not just when the
  // frontend and backend share a host on port 3000.
  const apiUrl = new URL(API_BASE);
  const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = getToken();
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${protocol}//${apiUrl.host}/api/terminal${tokenParam}`;
}
