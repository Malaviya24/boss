const HOMEPAGE_CACHE_TTL_MS = Number.parseInt(
  import.meta.env.VITE_HOMEPAGE_CACHE_TTL_MS ?? '4500',
  10,
);
const HOMEPAGE_STORAGE_KEY = 'dpboss_homepage_payload_v1';
const API_TIMEOUT_MS = Number.parseInt(import.meta.env.VITE_API_TIMEOUT_MS ?? '12000', 10);

let homepageCache = {
  payload: null,
  expiresAt: 0,
};
let homepageInFlightPromise = null;

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

function readHomepageStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(HOMEPAGE_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed?.template || !parsed?.htmlBySectionId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeHomepageStorage(payload) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(HOMEPAGE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota and privacy mode failures.
  }
}

export async function fetchJson(path, { signal } = {}) {
  const response = await withTimeout(
    fetch(path, {
      credentials: 'same-origin',
      signal,
    }),
    API_TIMEOUT_MS,
  );

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
  const storedPayload = readHomepageStorage();

  if (!force && homepageCache.payload && homepageCache.expiresAt > now) {
    return Promise.resolve(homepageCache.payload);
  }

  if (!force && !homepageCache.payload && storedPayload) {
    homepageCache = {
      payload: storedPayload,
      expiresAt: now + 1500,
    };
    return Promise.resolve(storedPayload);
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
      writeHomepageStorage(payload);
      return payload;
    })
    .catch((error) => {
      if (storedPayload) {
        return storedPayload;
      }
      throw error;
    })
    .finally(() => {
      homepageInFlightPromise = null;
    });

  homepageInFlightPromise = requestPromise;
  return requestPromise;
}
