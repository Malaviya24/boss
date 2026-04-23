import { getLiveMarketBySlug } from '../matka/matka-api.js';

const HOMEPAGE_CACHE_TTL_MS = Number.parseInt(
  import.meta.env.VITE_HOMEPAGE_CACHE_TTL_MS ?? '6000',
  10,
);
const API_TIMEOUT_MS = Number.parseInt(import.meta.env.VITE_API_TIMEOUT_MS ?? '30000', 10);
const LEGACY_LIVE_CACHE_TTL_MS = Number.parseInt(
  import.meta.env.VITE_LEGACY_LIVE_CACHE_TTL_MS ?? '5000',
  10,
);
const STATIC_MARKET_FILE_ONLY =
  String(import.meta.env.VITE_MARKET_STATIC_FILE_ONLY ?? 'true').toLowerCase() !== 'false';
const CONFIGURED_CONTENT_API_BASE_URL = String(
  import.meta.env.VITE_CONTENT_API_BASE_URL ?? '',
).trim();
const DEFAULT_RENDER_CONTENT_BASE_URL = 'https://boss-ehz0.onrender.com';
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);
const DEFAULT_FOOTER_RIGHTS_LINES = [
  'All Rights Reserved',
  '(1998-2024)',
  'Contact (Astrologer-Dpboss)',
];

const homepageCache = {
  data: null,
  expiresAt: 0,
  inFlight: null,
};

const marketCache = new Map();
const marketInFlight = new Map();
const legacyLiveCache = new Map();

let preferLegacyMarketContentApi = false;
let preferLegacyMarketLiveApi = false;

function normalizeMarketType(type = '') {
  return String(type).toLowerCase() === 'panel' ? 'panel' : 'jodi';
}

function normalizeMarketSlug(slug = '') {
  return String(slug ?? '')
    .toLowerCase()
    .replace(/\.php$/i, '')
    .replace(/[^a-z0-9-]/g, '');
}

function normalizeText(value = '') {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function toSlugDisplayName(slug = '') {
  const normalizedSlug = normalizeMarketSlug(slug);
  if (!normalizedSlug) {
    return '';
  }

  return normalizedSlug
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function stripHtmlToText(html = '') {
  const source = String(html ?? '');
  if (!source) {
    return '';
  }

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const documentNode = parser.parseFromString(`<div>${source}</div>`, 'text/html');
    const text = normalizeText(documentNode.body?.textContent ?? '');
    if (text) {
      return text;
    }
  }

  return normalizeText(source.replace(/<[^>]+>/g, ' '));
}

function toStructuredFooterBlocks(htmlBlocks = []) {
  if (!Array.isArray(htmlBlocks)) {
    return [];
  }

  const blocks = [];
  for (const blockHtml of htmlBlocks) {
    const text = stripHtmlToText(blockHtml);
    if (!text) {
      continue;
    }

    blocks.push({
      tag: 'p',
      className: '',
      text,
    });
  }

  return blocks;
}

function toLegacyFooter(legacyPayload = {}) {
  const footerBlocks = toStructuredFooterBlocks(legacyPayload.footerHtmlBlocks);
  const summaryTitle = normalizeText(legacyPayload?.summary?.title);
  const summaryDescription = normalizeText(legacyPayload?.summary?.description);

  if (footerBlocks.length === 0) {
    if (summaryTitle) {
      footerBlocks.push({
        tag: 'h3',
        className: 'faq-heading',
        text: summaryTitle,
      });
    }
    if (summaryDescription) {
      footerBlocks.push({
        tag: 'p',
        className: '',
        text: summaryDescription,
      });
    }
  }

  return {
    blocks: footerBlocks,
    counterText: '',
    brandTitle: 'DPBOSS.BOSTON',
    rightsLines: DEFAULT_FOOTER_RIGHTS_LINES,
    matkaPlay: {
      label: 'Matka Play',
      href: '/',
    },
  };
}

function toStructuredRows(rows = [], columns = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows.map((row, rowIndex) => {
    const sourceCells = Array.isArray(row?.cells) ? row.cells : [];
    return {
      id: String(row?.id ?? rowIndex),
      rowIndex,
      cells: sourceCells.map((cell, cellIndex) => ({
        id: String(cell?.id ?? cellIndex),
        column: String(columns[cellIndex] ?? ''),
        text: normalizeText(cell?.text ?? ''),
        isHighlight: Boolean(cell?.isHighlight),
        className: Boolean(cell?.isHighlight) ? 'r' : '',
        attrs: Boolean(cell?.isHighlight) ? { class: 'r' } : {},
      })),
    };
  });
}

function parseResultParts(value = '') {
  const normalized = normalizeText(value);
  const groupedMatch = normalized.match(/(\d{1,3})\D+(\d{1,2})\D+(\d{1,3})/);
  if (groupedMatch) {
    const [, openPanel, jodi, closePanel] = groupedMatch;
    return {
      number: `${openPanel}-${jodi.padStart(2, '0')}-${closePanel}`,
      jodi: jodi.padStart(2, '0'),
      panel: `${openPanel}-${closePanel}`,
    };
  }

  const jodiMatch = normalized.match(/\b\d{2}\b/);
  return {
    number: normalized,
    jodi: jodiMatch ? jodiMatch[0] : '',
    panel: '',
  };
}

function toStructuredMarketContentFromLegacy(legacyPayload = {}, { type, slug } = {}) {
  const normalizedType = normalizeMarketType(type);
  const normalizedSlug = normalizeMarketSlug(slug);
  const tableColumns = Array.isArray(legacyPayload?.table?.columns)
    ? legacyPayload.table.columns.map((column) => normalizeText(column))
    : [];
  const tableRows = toStructuredRows(legacyPayload?.table?.rows, tableColumns);
  const resultValue = normalizeText(legacyPayload?.result?.value) || 'Result Coming';
  const fallbackName = toSlugDisplayName(normalizedSlug).toUpperCase();
  const headingText = normalizeText(legacyPayload?.heading);
  const resultName = normalizeText(legacyPayload?.result?.name) || headingText || fallbackName;
  const pageTitle = normalizeText(legacyPayload?.title) || `${fallbackName} ${normalizedType.toUpperCase()} CHART`;
  const description = normalizeText(legacyPayload?.description);

  return {
    version: 2,
    type: normalizedType,
    slug: normalizedSlug,
    title: pageTitle,
    description,
    seo: {
      meta: [],
    },
    styles: {
      urls: Array.isArray(legacyPayload?.styleUrls) ? legacyPayload.styleUrls : [],
      blocks: Array.isArray(legacyPayload?.styleBlocks) ? legacyPayload.styleBlocks : [],
      jsonLdBlocks: [],
    },
    hero: {
      logo: {
        href: '/',
        src: normalizeText(legacyPayload?.logoUrl) || '/img/logo.png',
        alt: 'DPBOSS',
      },
      chartTitle: headingText,
      smallHeading: normalizeText(legacyPayload?.summary?.title),
      introText: normalizeText(legacyPayload?.summary?.description),
    },
    result: {
      className: 'chart-result',
      marketName: resultName,
      value: resultValue,
      refreshLabel: 'Refresh Result',
      refreshHref: `/${normalizedType === 'panel' ? 'panel-chart-record' : 'jodi-chart-record'}/${normalizedSlug}.php`,
    },
    controls: {
      topAnchorId: 'market-top',
      bottomAnchorId: 'market-bottom',
      goBottomLabel: normalizeText(legacyPayload?.actions?.goBottomLabel) || 'Go to Bottom',
      goTopLabel: normalizeText(legacyPayload?.actions?.goTopLabel) || 'Go to Top',
    },
    table: {
      title: normalizeText(legacyPayload?.table?.heading) || headingText,
      attrs: {
        class: 'panel-chart chart-table',
        style: 'width: 100%; text-align:center;',
      },
      headingAttrs: {
        class: 'panel-heading text-center',
        style: 'background: #3f51b5;',
      },
      titleAttrs: {},
      columns: tableColumns,
      rows: tableRows,
    },
    footer: toLegacyFooter(legacyPayload),
    importedAt: null,
    updatedAt: null,
  };
}

function toLegacyLivePayload(legacyPayload = {}, { slug } = {}) {
  const normalizedSlug = normalizeMarketSlug(slug);
  const resultText = normalizeText(legacyPayload?.result?.value) || 'Result Coming';
  const parts = parseResultParts(resultText);
  return {
    slug: normalizedSlug,
    name:
      normalizeText(legacyPayload?.result?.name) ||
      normalizeText(legacyPayload?.heading) ||
      toSlugDisplayName(normalizedSlug).toUpperCase(),
    time: '',
    links: {},
    current: {
      number: parts.number || resultText,
      jodi: parts.jodi,
      panel: parts.panel,
    },
    stale: false,
    updatedAt: null,
    lastChangedAt: null,
  };
}

function toLegacyLiveCacheKey(type, slug) {
  return `${normalizeMarketType(type)}:${normalizeMarketSlug(slug)}`;
}

function readLegacyLiveCache(type, slug) {
  const key = toLegacyLiveCacheKey(type, slug);
  const cached = legacyLiveCache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    legacyLiveCache.delete(key);
    return null;
  }
  return cached.value;
}

function writeLegacyLiveCache(type, slug, value) {
  const key = toLegacyLiveCacheKey(type, slug);
  const ttl = Number.isFinite(LEGACY_LIVE_CACHE_TTL_MS) && LEGACY_LIVE_CACHE_TTL_MS >= 2000
    ? LEGACY_LIVE_CACHE_TTL_MS
    : 5000;
  legacyLiveCache.set(key, {
    value,
    expiresAt: Date.now() + ttl,
  });
}

function getLegacyMarketTemplatePaths(type, slug) {
  const encodedType = encodeURIComponent(type);
  const encodedSlug = encodeURIComponent(slug);

  if (STATIC_MARKET_FILE_ONLY) {
    return [`/api/market-template?type=${encodedType}&slug=${encodedSlug}`];
  }

  return [
    `/api/v1/market-template/${encodedType}/${encodedSlug}`,
    `/api/market-template/${encodedType}/${encodedSlug}`,
    `/api/v1/market-template?type=${encodedType}&slug=${encodedSlug}`,
    `/api/market-template?type=${encodedType}&slug=${encodedSlug}`,
  ];
}

async function requestLegacyMarketTemplate(type, slug, { signal } = {}) {
  const normalizedType = normalizeMarketType(type);
  const normalizedSlug = normalizeMarketSlug(slug);
  const candidatePaths = getLegacyMarketTemplatePaths(normalizedType, normalizedSlug);
  let lastError = null;

  for (const candidatePath of candidatePaths) {
    try {
      const payload = await requestJson(candidatePath, { signal });
      if (payload && typeof payload === 'object') {
        return payload;
      }
    } catch (error) {
      lastError = error;
      if (Number(error?.status) && Number(error.status) !== 404) {
        throw error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error('Legacy market template unavailable');
}

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

function resolveConfiguredContentBaseUrl() {
  const configured = normalizeBaseUrl(CONFIGURED_CONTENT_API_BASE_URL);
  if (configured && !isConfiguredBaseUnsafeForProd(configured)) {
    return configured;
  }

  return '';
}

function resolveRenderFallbackBaseUrl() {
  if (typeof window !== 'undefined') {
    const hostname = String(window.location.hostname || '').toLowerCase();
    if (!LOCAL_HOSTNAMES.has(hostname)) {
      return DEFAULT_RENDER_CONTENT_BASE_URL;
    }
  }

  return '';
}

function withBaseUrl(path, baseUrl = '') {
  if (!baseUrl) {
    return path;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${baseUrl}${path}`;
}

function isRetryableStatus(statusCode = 0) {
  return [500, 502, 503, 504].includes(Number(statusCode));
}

function isRetryableRequestFailure(error) {
  if (isRetryableStatus(error?.status)) {
    return true;
  }

  const message = String(error?.message ?? '').toLowerCase();
  const code = String(error?.code ?? '').toLowerCase();

  return (
    code === 'etimedout' ||
    code === 'econnaborted' ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch failed')
  );
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

async function requestJson(path, { signal, includeNotFoundFallback = false } = {}) {
  const configuredBase = resolveConfiguredContentBaseUrl();
  const fallbackBase = configuredBase || resolveRenderFallbackBaseUrl();
  const primaryPath = path;
  const secondaryPath = fallbackBase ? withBaseUrl(path, fallbackBase) : '';

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
    const shouldRetryOnNotFound =
      includeNotFoundFallback && Number(error?.status ?? 0) === 404;
    if (
      !secondaryPath ||
      secondaryPath === primaryPath ||
      (!isRetryableRequestFailure(error) && !shouldRetryOnNotFound)
    ) {
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
  legacyLiveCache.clear();
  preferLegacyMarketContentApi = false;
  preferLegacyMarketLiveApi = false;
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
    .catch(async (error) => {
      const statusCode = Number(error?.status ?? 0);
      const shouldTryLegacyFallback =
        statusCode === 404 ||
        statusCode === 500 ||
        statusCode === 502 ||
        statusCode === 503 ||
        statusCode === 504 ||
        isRetryableRequestFailure(error);

      if (!shouldTryLegacyFallback) {
        throw error;
      }

      return requestJson('/api/homepage', { signal });
    })
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
  const normalizedType = normalizeMarketType(type);
  const normalizedSlug = normalizeMarketSlug(slug);

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

  const fallbackToLegacyTemplate = async () => {
    const legacyPayload = await requestLegacyMarketTemplate(normalizedType, normalizedSlug, {
      signal,
    });
    preferLegacyMarketContentApi = true;
    return toStructuredMarketContentFromLegacy(legacyPayload, {
      type: normalizedType,
      slug: normalizedSlug,
    });
  };

  const fetchMarketContent = async () => {
    if (STATIC_MARKET_FILE_ONLY) {
      try {
        return await fallbackToLegacyTemplate();
      } catch (legacyError) {
        if (Number(legacyError?.status ?? 0) !== 404) {
          throw legacyError;
        }
        return requestJson(`/api/v1/market-content/${normalizedType}/${normalizedSlug}`, {
          signal,
          includeNotFoundFallback: true,
        });
      }
    }

    if (preferLegacyMarketContentApi) {
      return fallbackToLegacyTemplate();
    }

    try {
      return await requestJson(`/api/v1/market-content/${normalizedType}/${normalizedSlug}`, {
        signal,
        includeNotFoundFallback: true,
      });
    } catch (error) {
      if (Number(error?.status) !== 404) {
        throw error;
      }
      return fallbackToLegacyTemplate();
    }
  };

  const requestPromise = fetchMarketContent()
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

export function getMarketLiveRecord({ slug, type = '', signal } = {}) {
  const normalizedSlug = normalizeMarketSlug(slug);
  const normalizedType = normalizeMarketType(type);

  if (!normalizedSlug) {
    return Promise.resolve(null);
  }

  const loadLegacyLive = async () => {
    const cachedLive = readLegacyLiveCache(normalizedType, normalizedSlug);
    if (cachedLive) {
      return cachedLive;
    }

    const legacyPayload = await requestLegacyMarketTemplate(normalizedType, normalizedSlug, {
      signal,
    });
    const livePayload = toLegacyLivePayload(legacyPayload, {
      slug: normalizedSlug,
    });
    writeLegacyLiveCache(normalizedType, normalizedSlug, livePayload);
    preferLegacyMarketLiveApi = true;
    return livePayload;
  };

  const loadMatkaLive = async () => {
    const card = await getLiveMarketBySlug({
      slug: normalizedSlug,
      signal,
    });
    if (!card || typeof card !== 'object') {
      return null;
    }

    const openPanel = normalizeText(card.openPanel);
    const closePanel = normalizeText(card.closePanel);
    const displayResult = normalizeText(card.displayResult);
    const resultText = normalizeText(card.resultText);
    const derived = parseResultParts(displayResult || resultText);
    const currentNumber =
      displayResult ||
      resultText ||
      derived.number ||
      (openPanel && closePanel ? `${openPanel}-${derived.jodi || ''}-${closePanel}` : '') ||
      'Result Coming';

    return {
      slug: normalizedSlug,
      name: normalizeText(card.name) || toSlugDisplayName(normalizedSlug).toUpperCase(),
      time: normalizeText(`${card.openTimeLabel ?? ''} ${card.closeTimeLabel ?? ''}`),
      links: {},
      current: {
        number: currentNumber,
        jodi: normalizeText(card.middleJodi) || derived.jodi || '',
        panel: openPanel && closePanel ? `${openPanel}-${closePanel}` : openPanel || '',
      },
      stale: false,
      updatedAt: card.updatedAt ?? null,
      lastChangedAt: card.updatedAt ?? null,
    };
  };

  if (preferLegacyMarketLiveApi) {
    return loadLegacyLive().catch(() => null);
  }

  return loadMatkaLive()
    .catch(() => null)
    .then(async (matkaLive) => {
      if (matkaLive) {
        return matkaLive;
      }

      return requestJson(`/api/v1/market-live/${encodeURIComponent(normalizedSlug)}`, {
        signal,
        includeNotFoundFallback: true,
      }).catch(async (error) => {
        if (Number(error?.status) === 404 || isRetryableRequestFailure(error)) {
          if (STATIC_MARKET_FILE_ONLY) {
            return loadLegacyLive().catch(() => null);
          }
          return null;
        }

        if (STATIC_MARKET_FILE_ONLY) {
          return loadLegacyLive().catch(() => null);
        }
        return null;
      });
    });
}
