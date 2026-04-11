export function parseMarketRoute(pathname = '') {
  const normalizedPath = String(pathname || '')
    .trim()
    .toLowerCase()
    .split('?', 1)[0]
    .split('#', 1)[0];

  const match = normalizedPath.match(/^\/market\/(jodi|panel)\/([a-z0-9-]+)(?:\.php)?\/?$/i);
  if (!match) {
    return null;
  }

  return {
    type: match[1] === 'panel' ? 'panel' : 'jodi',
    slug: String(match[2]).replace(/\.php$/i, ''),
  };
}
