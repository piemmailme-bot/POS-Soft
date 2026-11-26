// Universal API Client for Nabkul POS SQL Database Backend
// Connects to local express routes '/api/*' or any custom backend via VITE_API_URL
export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

const unauthorizedListeners = new Set<(reason?: string) => void>();
let inMemorySessionToken: string | null = null;

export function getSessionToken(): string | null {
  return inMemorySessionToken;
}

export function setSessionToken(token: string | null): void {
  inMemorySessionToken = token;
}

export function clearSessionToken(): void {
  inMemorySessionToken = null;
}

export function onSessionInvalidated(listener: (reason?: string) => void): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function notifySessionInvalidated(reason?: string) {
  unauthorizedListeners.forEach((fn) => {
    try {
      fn(reason);
    } catch {
      // ignore listener errors
    }
  });
}

export function getAuthHeaders(extra?: HeadersInit): Record<string, string> {
  const headers: Record<string, string> = {};
  if (extra) {
    if (extra instanceof Headers) {
      extra.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(extra)) {
      extra.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, extra);
    }
  }
  const token = getSessionToken();
  if (token && !headers.Authorization && !headers.authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

const RETRYABLE_GATEWAY_STATUSES = new Set([502, 503, 504]);

export async function fetchWithWakeupRetry(
  input: RequestInfo | URL,
  options?: RequestInit,
  maxRetries = 2
): Promise<Response> {
  const method = String(options?.method || 'GET').toUpperCase();
  const canRetryOnNetworkError = method === 'GET' || method === 'HEAD' || input.toString().includes('/api/auth/login');
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(input, options);
      // Do not retry 503 JSON responses explicitly marked cloudOffline by our backend
      if (RETRYABLE_GATEWAY_STATUSES.has(res.status) && attempt < maxRetries) {
        const contentType = res.headers.get('content-type') || '';
        let isExplicitCloudOffline = false;
        if (contentType.includes('application/json')) {
          try {
            const clone = res.clone();
            const body = await clone.json();
            if (body?.cloudOffline) isExplicitCloudOffline = true;
          } catch {
            // non-json gateway error (e.g. cold-start 502/503 HTML) -> retry
          }
        }
        if (!isExplicitCloudOffline && canRetryOnNetworkError) {
          await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
          continue;
        }
      }
      return res;
    } catch (err) {
      lastError = err;
      if (!canRetryOnNetworkError || attempt >= maxRetries) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function authFetch(input: RequestInfo | URL, options?: RequestInit): Promise<Response> {
  const res = await fetchWithWakeupRetry(input, {
    cache: 'no-store',
    ...options,
    headers: getAuthHeaders(options?.headers),
  });
  if (res.status === 401) {
    try {
      const clone = res.clone();
      const body = await clone.json();
      if (body?.forceLogout) {
        clearSessionToken();
        notifySessionInvalidated(body?.error || body?.message || 'Session ended.');
      }
    } catch {
      // ignore parse errors
    }
  }
  return res;
}

export async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  const res = await authFetch(url, {
    cache: 'no-store',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`API Request to ${url} failed [${res.status}]: ${errorText}`);
  }

  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return res.json();
  }
  return {} as T;
}

export const api = {
  get: <T>(endpoint: string) => apiFetch<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body?: any) =>
    apiFetch<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(endpoint: string, body?: any) =>
    apiFetch<T>(endpoint, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(endpoint: string) => apiFetch<T>(endpoint, { method: 'DELETE' }),
};
