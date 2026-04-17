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
  const raw = process.env.RENDER_BACKEND_URL?.trim();
  if (!raw) {
    throw new Error('RENDER_BACKEND_URL is not configured');
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(withProtocol);
  return `${parsed.protocol}//${parsed.host}`;
}

function getCloneCssTimeoutMs() {
  const parsed = Number.parseInt(String(process.env.PROXY_TIMEOUT_MS ?? ''), 10);
  if (Number.isFinite(parsed) && parsed >= 1000) {
    return parsed;
  }

  return 20000;
}

export default async function handler(_request, response) {
  try {
    const controller = new AbortController();
    const timeoutMs = getCloneCssTimeoutMs();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let upstreamResponse;
    try {
      upstreamResponse = await fetch(`${getBackendOrigin()}/api/clone-css`, {
        headers: {
          accept: 'text/css,*/*;q=0.1',
          'accept-encoding': 'identity',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

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
      .send(
        `/* clone css unavailable: ${error.message} */
body{margin:0;background:#ffcc99;color:#001699;font-family:Helvetica,Arial,sans-serif}
#root{min-height:100vh}`,
      );
  }
}
