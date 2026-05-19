const MARKET_LINK_PATTERN =
  /(?:^|\/)(jodi-chart-record|panel-chart-record)\/([a-z0-9-]+)(?:\.php)?$/i;
const LOCAL_MARKET_LINK_PATTERN =
  /(?:^|\/)(?:market|api\/market-page)\/(jodi|panel)\/([a-z0-9-]+)(?:\.php)?$/i;

function getPathname(value = '') {
  if (!value) {
    return '';
  }

  try {
    return new URL(value, 'https://matkaking.boston/').pathname;
  } catch {
    return String(value).split(/[?#]/, 1)[0] ?? '';
  }
}

export function normalizeMarketSlug(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\.php$/i, '')
    .replace(/[^a-z0-9-]/g, '');
}

export function buildLocalMarketPath(type, slug) {
  const normalizedType = type === 'panel' ? 'panel' : 'jodi';
  const normalizedSlug = normalizeMarketSlug(slug);
  if (!normalizedSlug) {
    return '';
  }

  const prefix = normalizedType === 'panel' ? 'panel-chart-record' : 'jodi-chart-record';
  return `/${prefix}/${normalizedSlug}.php`;
}

export function extractMarketLink(value = '') {
  const pathname = getPathname(value);

  const localMatch = pathname.match(LOCAL_MARKET_LINK_PATTERN);
  if (localMatch) {
    const [, localType, localSlug] = localMatch;
    const type = localType.toLowerCase() === 'panel' ? 'panel' : 'jodi';
    const slug = normalizeMarketSlug(localSlug);

    if (!slug) {
      return null;
    }

    return {
      type,
      slug,
    };
  }

  const match = pathname.match(MARKET_LINK_PATTERN);
  if (!match) {
    return null;
  }

  const [, rawType, rawSlug] = match;
  const type = rawType.toLowerCase().startsWith('panel') ? 'panel' : 'jodi';
  const slug = normalizeMarketSlug(rawSlug);

  if (!slug) {
    return null;
  }

  return {
    type,
    slug,
  };
}

export function toLocalMarketPath(value = '') {
  const parsed = extractMarketLink(value);
  if (!parsed) {
    return '';
  }

  return buildLocalMarketPath(parsed.type, parsed.slug);
}

// Map of legacy .php / .html page basenames to the internal React route
// they were converted to (see scripts/convert-static-pages.mjs).
const STATIC_PAGE_ROUTE_MAP = new Map([
  ['about.php', '/about'],
  ['privacy.php', '/privacy'],
  ['tos.php', '/tos'],
  ['matka-jodi-count-chart.php', '/matka-jodi-count-chart'],
  ['jodi-chart-family-matka.php', '/jodi-chart-family-matka'],
  ['penal-count-chart.php', '/penal-count-chart'],
  ['penal-total-chart.php', '/penal-total-chart'],
  ['all-22-card-panna-penal-patti-chart.php', '/all-22-card-panna-penal-patti-chart'],
  ['fix-open-to-close-by-date.php', '/fix-open-to-close-by-date'],
  ['matkaking-result-api.php', '/matkaking-result-api'],
  ['matkaking-result-api-documentation.html', '/matkaking-result-api-documentation'],
]);

/**
 * Resolve a (possibly absolute) URL to an internal route if it points to one
 * of the legacy static .php / .html pages we converted to React routes.
 * Returns '' if the value does not match any known static page.
 */
export function toLocalStaticPagePath(value = '') {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  let pathname = '';
  try {
    pathname = new URL(raw, 'https://matkakingss.boston/').pathname;
  } catch {
    pathname = raw.split(/[?#]/, 1)[0] ?? '';
  }

  // Strip leading slash and lowercase the basename for case-insensitive lookup
  const cleanPath = String(pathname || '').replace(/^\/+/, '').toLowerCase();
  if (!cleanPath) {
    return '';
  }

  // The map lookup keys are lowercase already
  if (STATIC_PAGE_ROUTE_MAP.has(cleanPath)) {
    return STATIC_PAGE_ROUTE_MAP.get(cleanPath);
  }

  return '';
}

/**
 * Returns true if the URL points to the source scraping site's homepage.
 */
export function isExternalSourceHomepage(value = '') {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return false;
  }

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (!/^(?:www\.)?MatkaKingss?\.boston$/.test(host)) {
      return false;
    }
    const path = parsed.pathname.replace(/\/+$/, '');
    return path === '' || path === '/';
  } catch {
    return false;
  }
}
