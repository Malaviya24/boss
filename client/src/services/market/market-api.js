const marketCache = new Map();
const inFlightCache = new Map();

function toCacheKey(type, slug, offset, limit) {
  return `${type}:${slug}:${offset}:${limit}`;
}

function sanitizeType(value = '') {
  return value === 'panel' ? 'panel' : 'jodi';
}

function sanitizeSlug(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\.php$/i, '')
    .replace(/[^a-z0-9-]/g, '');
}

export function clearMarketTemplateCache() {
  marketCache.clear();
  inFlightCache.clear();
}

export async function fetchMarketTemplate({
  type,
  slug,
  offset = 0,
  limit = 180,
  force = false,
  signal,
} = {}) {
  const normalizedType = sanitizeType(type);
  const normalizedSlug = sanitizeSlug(slug);
  const normalizedOffset = Math.max(0, Number.parseInt(String(offset), 10) || 0);
  const normalizedLimit = Math.min(400, Math.max(20, Number.parseInt(String(limit), 10) || 180));

  if (!normalizedSlug) {
    throw new Error('Invalid market slug');
  }

  const cacheKey = toCacheKey(normalizedType, normalizedSlug, normalizedOffset, normalizedLimit);
  if (!force && marketCache.has(cacheKey)) {
    return marketCache.get(cacheKey);
  }

  if (!force && inFlightCache.has(cacheKey)) {
    return inFlightCache.get(cacheKey);
  }

  const search = new URLSearchParams({
    type: normalizedType,
    slug: normalizedSlug,
    offset: String(normalizedOffset),
    limit: String(normalizedLimit),
  });

  const promise = fetch(`/api/market-template?${search.toString()}`, {
    method: 'GET',
    credentials: 'same-origin',
    signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.message || payload?.error || `Request failed (${response.status})`;
        const requestError = new Error(message);
        requestError.status = response.status;
        requestError.code = payload?.code || payload?.errorCode || '';
        throw requestError;
      }

      return response.json();
    })
    .then((payload) => {
      marketCache.set(cacheKey, payload);
      return payload;
    })
    .finally(() => {
      inFlightCache.delete(cacheKey);
    });

  inFlightCache.set(cacheKey, promise);
  return promise;
}
