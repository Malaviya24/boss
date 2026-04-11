const MARKET_LINK_PATTERN =
  /(?:^|\/)(jodi-chart-record|panel-chart-record)\/([a-z0-9-]+)\.php$/i;
const LOCAL_MARKET_LINK_PATTERN =
  /(?:^|\/)(?:market|api\/market-page)\/(jodi|panel)\/([a-z0-9-]+)(?:\.php)?$/i;

function getPathname(value = '') {
  if (!value) {
    return '';
  }

  try {
    return new URL(value, 'https://dpboss.boston/').pathname;
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

  return `/market/${normalizedType}/${normalizedSlug}`;
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
