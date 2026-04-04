const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
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
    const upstreamResponse = await fetch(`${getBackendOrigin()}/api/clone-css`);

    upstreamResponse.headers.forEach((value, key) => {
      if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        return;
      }

      response.setHeader(key, value);
    });

    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.status(upstreamResponse.status).send(
      Buffer.from(await upstreamResponse.arrayBuffer()),
    );
  } catch {
    response.status(502).type('text/plain').send('/* clone css unavailable */');
  }
}
