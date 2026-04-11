import { proxyRequest } from './_proxy.js';

function normalizePathSegment(value) {
  return String(value ?? '')
    .replace(/^\/+/, '')
    .replace(/\.{2,}/g, '')
    .trim();
}

export default async function handler(request, response) {
  const rawPath = Array.isArray(request.query?.path)
    ? request.query.path[0]
    : request.query?.path;
  const normalizedPath = normalizePathSegment(rawPath);

  if (!normalizedPath) {
    response.status(400).json({ error: 'Missing market path' });
    return;
  }

  return proxyRequest(request, response, `/market/${normalizedPath}`, {
    forceNoStore: false,
    omitQueryKeys: ['path'],
  });
}
