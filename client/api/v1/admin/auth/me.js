import { proxyRequest } from '../../../_proxy.js';

export default async function handler(request, response) {
  return proxyRequest(request, response, '/api/v1/admin/auth/me', {
    methods: ['GET', 'HEAD', 'OPTIONS'],
    forceNoStore: true,
    staleCacheMs: 0,
  });
}
