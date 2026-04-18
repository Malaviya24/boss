import { proxyRequest } from '../lib/vercel-proxy.js';

const ALLOWED_PREFIXES = new Set(['images', 'img', 'newfev']);

function normalizeAssetPath(value) {
  return String(value ?? '')
    .replace(/^\/+/, '')
    .replace(/\.{2,}/g, '')
    .trim();
}

function isAllowedAssetPath(pathValue) {
  const [prefix] = String(pathValue).split('/', 1);
  return ALLOWED_PREFIXES.has(prefix);
}

export default async function handler(request, response) {
  const rawPath = Array.isArray(request.query?.path)
    ? request.query.path[0]
    : request.query?.path;
  const normalizedPath = normalizeAssetPath(rawPath);

  if (!normalizedPath || !isAllowedAssetPath(normalizedPath)) {
    response.status(400).json({ error: 'Invalid asset path' });
    return;
  }

  return proxyRequest(request, response, `/${normalizedPath}`, {
    forceNoStore: false,
    omitQueryKeys: ['path'],
  });
}
