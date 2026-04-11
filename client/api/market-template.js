import { proxyRequest } from './_proxy.js';

function normalizeSegment(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
}

export default async function handler(request, response) {
  const type = normalizeSegment(Array.isArray(request.query?.type) ? request.query.type[0] : request.query?.type);
  const slug = normalizeSegment(Array.isArray(request.query?.slug) ? request.query.slug[0] : request.query?.slug);

  if (!['jodi', 'panel'].includes(type) || !slug) {
    response.status(400).json({ error: 'Invalid market template request' });
    return;
  }

  return proxyRequest(request, response, `/api/market-template/${type}/${slug}`, {
    forceNoStore: true,
    omitQueryKeys: ['type', 'slug'],
  });
}
