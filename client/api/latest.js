import { proxyApiRequest } from './_proxy.js';

export default async function handler(request, response) {
  return proxyApiRequest(request, response, '/api/latest');
}
