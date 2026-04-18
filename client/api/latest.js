import { proxyApiRequest } from '../lib/vercel-proxy.js';

export default async function handler(request, response) {
  return proxyApiRequest(request, response, '/api/latest');
}
