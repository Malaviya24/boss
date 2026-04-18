const API_TIMEOUT_MS = Number.parseInt(import.meta.env.VITE_API_TIMEOUT_MS ?? '12000', 10);
const CSRF_TOKEN = String(import.meta.env.VITE_CSRF_TOKEN ?? '').trim();
const ADMIN_TOKEN_KEY = 'dpboss_admin_token';
const CONFIGURED_MATKA_BASE_URL = String(import.meta.env.VITE_MATKA_API_BASE_URL ?? '').trim();
const DEFAULT_VERCEL_MATKA_BASE_URL = 'https://boss-ehz0.onrender.com';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

function ensureErrorMessage(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (value && typeof value === 'object') {
    if (typeof value.message === 'string' && value.message.trim()) {
      return value.message;
    }
    if (typeof value.error === 'string' && value.error.trim()) {
      return value.error;
    }
  }
  return fallback;
}

export function getReadableErrorMessage(error, fallback = 'Request failed') {
  if (!error) {
    return fallback;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  const fromMessage = ensureErrorMessage(error?.message, '');
  if (fromMessage) {
    return fromMessage;
  }

  const fromError = ensureErrorMessage(error?.error, '');
  if (fromError) {
    return fromError;
  }

  return fallback;
}

function normalizeBaseUrl(value = '') {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }
  return raw.replace(/\/+$/, '');
}

function resolveMatkaBaseUrl() {
  const configured = normalizeBaseUrl(CONFIGURED_MATKA_BASE_URL);
  if (configured) {
    return configured;
  }

  if (typeof window !== 'undefined') {
    const hostname = String(window.location.hostname || '').toLowerCase();
    if (!LOCAL_HOSTNAMES.has(hostname)) {
      return DEFAULT_VERCEL_MATKA_BASE_URL;
    }
  }

  return '';
}

function withBaseUrl(path) {
  const baseUrl = resolveMatkaBaseUrl();
  if (!baseUrl) {
    return path;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${baseUrl}${path}`;
}

function withTimeout(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timeoutId;
  const timed = Promise.race([
    promise,
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`request timeout (${timeoutMs}ms)`));
      }, timeoutMs);
    }),
  ]);

  return timed.finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function buildFetchOptions({ method, headers, body, signal, requestPath }) {
  const hasWindow = typeof window !== 'undefined';
  const currentOrigin = hasWindow ? window.location.origin : '';
  const requestOrigin = hasWindow ? new URL(requestPath, currentOrigin).origin : '';
  const sameOrigin = !hasWindow || requestOrigin === currentOrigin;

  return {
    method,
    headers,
    body,
    credentials: sameOrigin ? 'same-origin' : 'omit',
    mode: 'cors',
    signal,
  };
}

async function doRequest(path, { method, headers, body, signal, requestPath }) {
  const response = await withTimeout(
    fetch(requestPath, buildFetchOptions({ method, headers, body, signal, requestPath })),
    API_TIMEOUT_MS,
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      ensureErrorMessage(payload?.message, '') ||
      ensureErrorMessage(payload?.error, '') ||
      `${requestPath} failed with ${response.status}`;

    const requestError = new Error(message);
    requestError.status = response.status;
    requestError.code = payload?.code || '';
    requestError.requestPath = requestPath;
    requestError.path = path;
    throw requestError;
  }

  const payload = await response.json().catch(() => ({}));
  if (payload && typeof payload === 'object' && 'success' in payload) {
    return payload.data;
  }
  return payload;
}

function shouldRetryViaRender(path, requestPath, statusCode) {
  const isMatkaPath =
    String(path).startsWith('/api/v1/admin/') || String(path).startsWith('/api/v1/live/');
  if (!isMatkaPath || statusCode !== 404) {
    return false;
  }

  const normalizedRequestPath = String(requestPath || '');
  if (normalizedRequestPath.startsWith(DEFAULT_VERCEL_MATKA_BASE_URL)) {
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  const hostname = String(window.location.hostname || '').toLowerCase();
  if (LOCAL_HOSTNAMES.has(hostname)) {
    return false;
  }

  return true;
}

function toRenderAbsolutePath(path) {
  return `${DEFAULT_VERCEL_MATKA_BASE_URL}${path}`;
}

async function requestJson(path, { method = 'GET', body, token, signal } = {}) {
  const requestPath = withBaseUrl(path);
  const requestBody = body === undefined ? undefined : JSON.stringify(body);
  const headers = {
    Accept: 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && CSRF_TOKEN) {
    headers['x-csrf-token'] = CSRF_TOKEN;
  }

  try {
    return await doRequest(path, {
      method,
      headers,
      body: requestBody,
      signal,
      requestPath,
    });
  } catch (error) {
    if (!shouldRetryViaRender(path, requestPath, error?.status ?? 0)) {
      throw error;
    }

    return doRequest(path, {
      method,
      headers,
      body: requestBody,
      signal,
      requestPath: toRenderAbsolutePath(path),
    });
  }
}

export function getAdminToken() {
  return window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
}

export function setAdminToken(token) {
  if (!token) {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export async function loginAdmin({ username, password }) {
  return requestJson('/api/v1/admin/auth/login', {
    method: 'POST',
    body: { username, password },
  });
}

export async function logoutAdmin({ token }) {
  return requestJson('/api/v1/admin/auth/logout', {
    method: 'POST',
    token,
  });
}

export async function getAdminMe({ token, signal } = {}) {
  return requestJson('/api/v1/admin/auth/me', {
    method: 'GET',
    token,
    signal,
  });
}

export async function getLiveMarkets({ signal } = {}) {
  return requestJson('/api/v1/live/markets', {
    method: 'GET',
    signal,
  });
}

export async function getLiveMarketBySlug({ slug, signal } = {}) {
  return requestJson(`/api/v1/live/markets/${encodeURIComponent(slug)}`, {
    method: 'GET',
    signal,
  });
}

export async function getAdminMarkets({ token, signal } = {}) {
  return requestJson('/api/v1/admin/markets', {
    method: 'GET',
    token,
    signal,
  });
}

export async function createAdminMarket({ token, payload }) {
  return requestJson('/api/v1/admin/markets', {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function patchAdminMarket({ token, marketId, payload }) {
  return requestJson(`/api/v1/admin/markets/${encodeURIComponent(marketId)}`, {
    method: 'PATCH',
    token,
    body: payload,
  });
}

export async function deleteAdminMarket({ token, marketId }) {
  return requestJson(`/api/v1/admin/markets/${encodeURIComponent(marketId)}`, {
    method: 'DELETE',
    token,
  });
}

export async function toggleAdminMarket({ token, marketId }) {
  return requestJson(`/api/v1/admin/markets/${encodeURIComponent(marketId)}/toggle-active`, {
    method: 'PATCH',
    token,
  });
}

export async function updateOpenPanel({ token, marketId, panel }) {
  return requestJson(`/api/v1/admin/markets/${encodeURIComponent(marketId)}/results/open`, {
    method: 'PUT',
    token,
    body: { panel },
  });
}

export async function updateClosePanel({ token, marketId, panel }) {
  return requestJson(`/api/v1/admin/markets/${encodeURIComponent(marketId)}/results/close`, {
    method: 'PUT',
    token,
    body: { panel },
  });
}

export async function getAdminAuditLogs({ token, limit = 100, signal } = {}) {
  return requestJson(`/api/v1/admin/audit-logs?limit=${encodeURIComponent(limit)}`, {
    method: 'GET',
    token,
    signal,
  });
}
