const HOMEPAGE_CACHE_TTL_MS = Number.parseInt(
  import.meta.env.VITE_HOMEPAGE_CACHE_TTL_MS ?? '4500',
  10,
);

let homepageCache = {
  payload: null,
  expiresAt: 0,
};
let homepageInFlightPromise = null;

export async function fetchJson(path, { signal } = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    signal,
  });

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }

  return response.json();
}

export function invalidateHomepageCache() {
  homepageCache = {
    payload: null,
    expiresAt: 0,
  };
}

export function fetchHomepage({ force = false, signal } = {}) {
  const now = Date.now();

  if (!force && homepageCache.payload && homepageCache.expiresAt > now) {
    return Promise.resolve(homepageCache.payload);
  }

  if (!force && homepageInFlightPromise) {
    return homepageInFlightPromise;
  }

  const requestPromise = fetchJson('/api/homepage', { signal })
    .then((payload) => {
      homepageCache = {
        payload,
        expiresAt: Date.now() + HOMEPAGE_CACHE_TTL_MS,
      };
      return payload;
    })
    .finally(() => {
      homepageInFlightPromise = null;
    });

  homepageInFlightPromise = requestPromise;
  return requestPromise;
}
