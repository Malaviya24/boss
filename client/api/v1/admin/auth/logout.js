import { proxyRequest } from '../../../_proxy.js';

export default async function handler(request, response) {
  return proxyRequest(request, response, '/api/v1/admin/auth/logout', {
    methods: ['POST', 'OPTIONS'],
    forceNoStore: true,
    staleCacheMs: 0,
  });
}
