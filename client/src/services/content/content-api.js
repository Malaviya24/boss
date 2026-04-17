const HOMEPAGE_CACHE_TTL_MS = Number.parseInt(
  import.meta.env.VITE_HOMEPAGE_CACHE_TTL_MS ?? '4500',
  10,
);
const API_TIMEOUT_MS = Number.parseInt(import.meta.env.VITE_API_TIMEOUT_MS ?? '12000', 10);

const homepageCache = {
  data: null,
  expiresAt: 0,
  inFlight: null,
};

const marketCache = new Map();
const marketInFlight = new Map();

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
  const response = await withTimeout(
    fetch(path, {
      method: 'GET',
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
    requestError.code = payload?.code || payload?.errorCode || '';
    throw requestError;
  }

  const payload = await response.json();
  if (payload && typeof payload === 'object' && 'success' in payload) {
    return payload.data;
  }

  return payload;
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
