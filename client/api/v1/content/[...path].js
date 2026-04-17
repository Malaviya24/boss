import { proxyRequest } from '../../_proxy.js';

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

export default async function handler(request, response) {
  const segments = normalizeSegments(request.query?.path);
  if (segments.length === 0) {
    response.status(400).json({ error: 'Invalid content path' });
    return;
  }

  return proxyRequest(request, response, `/api/v1/content/${segments.join('/')}`, {
    forceNoStore: false,
    omitQueryKeys: ['path'],
  });
}
