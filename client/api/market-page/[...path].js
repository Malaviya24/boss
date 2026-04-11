import { proxyRequest } from '../_proxy.js';

function cleanPathSegment(value) {
  return String(value ?? '')
    .replace(/^\/+/, '')
    .replace(/\.{2,}/g, '')
    .trim();
}

function resolveMarketPath(request) {
  const wildcardPath = request.query?.path;
  if (Array.isArray(wildcardPath) && wildcardPath.length > 0) {
    return wildcardPath.map(cleanPathSegment).filter(Boolean).join('/');
  }

  if (typeof wildcardPath === 'string' && wildcardPath.trim()) {
    return cleanPathSegment(wildcardPath);
  }

  return '';
}

export default async function handler(request, response) {
  const normalizedPath = resolveMarketPath(request);

  if (!normalizedPath) {
    response.status(400).json({ error: 'Missing market path' });
    return;
  }

  return proxyRequest(request, response, `/market/${normalizedPath}`, {
    forceNoStore: false,
    omitQueryKeys: ['path'],
  });
}
