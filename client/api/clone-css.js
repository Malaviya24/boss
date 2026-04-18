import { proxyRequest } from '../lib/vercel-proxy.js';

export default async function handler(request, response) {
  try {
    await proxyRequest(request, response, '/api/clone-css', {
      methods: ['GET', 'HEAD'],
      forceNoStore: false,
      staleCacheMs: 3600000,
    });
  } catch (error) {
    response
      .status(200)
      .setHeader('Content-Type', 'text/css; charset=utf-8')
      .setHeader('Cache-Control', 'no-store')
      .send(
        `/* clone css unavailable: ${error.message} */
body{margin:0;background:#ffcc99;color:#001699;font-family:Helvetica,Arial,sans-serif}
#root{min-height:100vh}`,
      );
  }
}
