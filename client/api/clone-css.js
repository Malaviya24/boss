const UNSAFE_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'content-encoding',
  'host',
  'x-powered-by',
  'server',
]);

function getBackendOrigin() {
  const value = process.env.RENDER_BACKEND_URL?.trim();
  if (!value) {
    throw new Error('RENDER_BACKEND_URL is not configured');
  }

  return value.replace(/\/$/, '');
}

export default async function handler(_request, response) {
  try {
    const upstreamResponse = await fetch(`${getBackendOrigin()}/api/clone-css`, {
      headers: {
        accept: 'text/css,*/*;q=0.1',
        'accept-encoding': 'identity',
      },
    });

    if (!upstreamResponse.ok) {
      throw new Error(`Clone CSS upstream returned ${upstreamResponse.status}`);
    }

    upstreamResponse.headers.forEach((value, key) => {
      if (UNSAFE_RESPONSE_HEADERS.has(key.toLowerCase())) {
        return;
      }

      response.setHeader(key, value);
    });

    response.setHeader('Content-Type', 'text/css; charset=utf-8');
    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.status(200).send(Buffer.from(await upstreamResponse.arrayBuffer()));
  } catch (error) {
    response
      .status(200)
      .setHeader('Content-Type', 'text/css; charset=utf-8')
      .setHeader('Cache-Control', 'no-store')
      .send(`/* clone css unavailable: ${error.message} */`);
  }
}
