import { proxyRequest } from '../_proxy.js';

export default async function handler(request, response) {
  const pathOnly = String(request.url || '').split('?', 1)[0] || '';
  const suffix = pathOnly.replace(/^\/api\/market-page\/?/i, '');
  const targetPath = `/market/${suffix}`;

  return proxyRequest(request, response, targetPath, {
    forceNoStore: false,
  });
}
