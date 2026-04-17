const API_TIMEOUT_MS = Number.parseInt(import.meta.env.VITE_API_TIMEOUT_MS ?? '12000', 10);
const CSRF_TOKEN = String(import.meta.env.VITE_CSRF_TOKEN ?? '').trim();
const ADMIN_TOKEN_KEY = 'dpboss_admin_token';

function withTimeout(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error(`request timeout (${timeoutMs}ms)`));
      }, timeoutMs);
    }),
  ]);
}

async function requestJson(path, { method = 'GET', body, token, signal } = {}) {
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

  const response = await withTimeout(
    fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    }),
    API_TIMEOUT_MS,
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.message || payload?.error || `${path} failed with ${response.status}`;
    const requestError = new Error(message);
    requestError.status = response.status;
    requestError.code = payload?.code || '';
    throw requestError;
  }

  const payload = await response.json().catch(() => ({}));
  if (payload && typeof payload === 'object' && 'success' in payload) {
    return payload.data;
  }
  return payload;
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
