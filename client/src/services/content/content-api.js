const HOMEPAGE_CACHE_TTL_MS = Number.parseInt(
  import.meta.env.VITE_HOMEPAGE_CACHE_TTL_MS ?? '6000',
  10,
);
const API_TIMEOUT_MS = Number.parseInt(import.meta.env.VITE_API_TIMEOUT_MS ?? '12000', 10);
const CONFIGURED_CONTENT_API_BASE_URL = String(
  import.meta.env.VITE_CONTENT_API_BASE_URL ?? '',
).trim();
const DEFAULT_RENDER_CONTENT_BASE_URL = 'https://boss-ehz0.onrender.com';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

const homepageCache = {
  data: null,
  expiresAt: 0,
  inFlight: null,
};

const marketCache = new Map();
const marketInFlight = new Map();

function normalizeBaseUrl(value = '') {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }
  const normalized = raw.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(normalized)) {
    return '';
  }
  return normalized;
}

function isConfiguredBaseUnsafeForProd(configuredBase = '') {
  if (!configuredBase || typeof window === 'undefined') {
    return false;
  }

  try {
    const currentHost = String(window.location.host || '').toLowerCase();
    const configuredHost = new URL(configuredBase).host.toLowerCase();
    const currentHostname = String(window.location.hostname || '').toLowerCase();
    return currentHost === configuredHost && !LOCAL_HOSTNAMES.has(currentHostname);
  } catch {
    return true;
  }
}

function resolveContentBaseUrl() {
  const configured = normalizeBaseUrl(CONFIGURED_CONTENT_API_BASE_URL);
  if (configured && !isConfiguredBaseUnsafeForProd(configured)) {
    return configured;
  }

  if (typeof window !== 'undefined') {
    const hostname = String(window.location.hostname || '').toLowerCase();
    if (!LOCAL_HOSTNAMES.has(hostname)) {
      return DEFAULT_RENDER_CONTENT_BASE_URL;
    }
  }

  return '';
}

function withBaseUrl(path) {
  const baseUrl = resolveContentBaseUrl();
  if (!baseUrl) {
    return path;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${baseUrl}${path}`;
}

function isRetryableStatus(statusCode = 0) {
  return [404, 500, 502, 503, 504].includes(Number(statusCode));
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

async function requestJson(path, { signal } = {}) {
  const primaryPath = withBaseUrl(path);
  const secondaryPath = primaryPath !== path ? path : '';

  const request = async (requestPath) => {
    const response = await withTimeout(
      fetch(requestPath, {
        method: 'GET',
        credentials: 'same-origin',
        signal,
      }),
      API_TIMEOUT_MS,
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = payload?.message || payload?.error || `${requestPath} failed with ${response.status}`;
      const requestError = new Error(message);
      requestError.status = response.status;
      requestError.code = payload?.code || payload?.errorCode || '';
      throw requestError;
    }

    const payload = await response.json();
    if (payload && typeof payload === 'object' && 'success' in payload) {
      return payload.data;
    }

    return payload;
  };

  try {
    return await request(primaryPath);
  } catch (error) {
    if (!secondaryPath || !isRetryableStatus(error?.status)) {
      throw error;
    }
    return request(secondaryPath);
  }
}

export function invalidateHomepageContentCache() {
  homepageCache.data = null;
  homepageCache.expiresAt = 0;
}

export function clearMarketContentCache() {
  marketCache.clear();
  marketInFlight.clear();
}

export function getHomepageContent({ force = false, signal } = {}) {
  const now = Date.now();
  if (!force && homepageCache.data && homepageCache.expiresAt > now) {
    return Promise.resolve(homepageCache.data);
  }

  if (!force && homepageCache.inFlight) {
    return homepageCache.inFlight;
  }

  const requestPromise = requestJson('/api/v1/content/homepage', { signal })
    .then((data) => {
      homepageCache.data = data;
      homepageCache.expiresAt = Date.now() + HOMEPAGE_CACHE_TTL_MS;
      return data;
    })
    .catch((error) => {
      if (homepageCache.data) {
        homepageCache.expiresAt = Date.now() + Math.max(2000, HOMEPAGE_CACHE_TTL_MS / 2);
        return homepageCache.data;
      }
      throw error;
    })
    .finally(() => {
      homepageCache.inFlight = null;
    });

  homepageCache.inFlight = requestPromise;
  return requestPromise;
}

function toMarketCacheKey(type, slug) {
  return `${type}:${slug}`;
}

export function getMarketContent({ type, slug, force = false, signal } = {}) {
  const normalizedType = type === 'panel' ? 'panel' : 'jodi';
  const normalizedSlug = String(slug ?? '')
    .toLowerCase()
    .replace(/\.php$/i, '')
    .replace(/[^a-z0-9-]/g, '');

  if (!normalizedSlug) {
    throw new Error('Invalid market slug');
  }

  const cacheKey = toMarketCacheKey(normalizedType, normalizedSlug);
  if (!force && marketCache.has(cacheKey)) {
    return Promise.resolve(marketCache.get(cacheKey));
  }

  if (!force && marketInFlight.has(cacheKey)) {
    return marketInFlight.get(cacheKey);
  }

  const requestPromise = requestJson(
    `/api/v1/content/market/${normalizedType}/${normalizedSlug}`,
    { signal },
  )
    .then((data) => {
      marketCache.set(cacheKey, data);
      return data;
    })
    .finally(() => {
      marketInFlight.delete(cacheKey);
    });

  marketInFlight.set(cacheKey, requestPromise);
  return requestPromise;
}

export function getMarketLiveRecord({ slug, signal } = {}) {
  const normalizedSlug = String(slug ?? '')
    .toLowerCase()
    .replace(/\.php$/i, '')
    .replace(/[^a-z0-9-]/g, '');

  if (!normalizedSlug) {
    return Promise.resolve(null);
  }

  return requestJson(`/api/market?slug=${encodeURIComponent(normalizedSlug)}`, { signal })
    .then((records) => (Array.isArray(records) ? records[0] ?? null : null))
    .catch(() => null);
}
