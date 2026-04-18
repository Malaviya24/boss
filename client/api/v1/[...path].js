import { proxyRequest } from '../../lib/vercel-proxy.js';

function normalizeSegments(input) {
  const values = Array.isArray(input) ? input : [input];
  const segments = [];

  for (const raw of values) {
    for (const piece of String(raw ?? '').split('/')) {
      const cleaned = String(piece).trim().replace(/[^a-z0-9._%~@+-]/gi, '');
      if (cleaned) {
        segments.push(cleaned);
      }
    }
  }

  return segments;
}

function segmentsFromUrl(url = '') {
  try {
    const pathname = new URL(String(url || ''), 'http://localhost').pathname;
    const prefix = '/api/v1/';
    if (!pathname.startsWith(prefix)) {
      return [];
    }

    const rawTail = pathname.slice(prefix.length);
    if (!rawTail) {
      return [];
    }

    return normalizeSegments(rawTail.split('/').map((part) => decodeURIComponent(part)));
  } catch {
    return [];
  }
}

export default async function handler(request, response) {
  const segments = normalizeSegments(request.query?.path);
  const resolvedSegments = segments.length > 0 ? segments : segmentsFromUrl(request.url);

  if (resolvedSegments.length === 0) {
    response.status(400).json({ error: 'Invalid v1 API path' });
    return;
  }

  const isAdminRoute = resolvedSegments[0] === 'admin';
  const staleCacheMs = isAdminRoute ? 0 : 180000;

  return proxyRequest(request, response, `/api/v1/${resolvedSegments.join('/')}`, {
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    forceNoStore: true,
    omitQueryKeys: ['path'],
    staleCacheMs,
  });
}
