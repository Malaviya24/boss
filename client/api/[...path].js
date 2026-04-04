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

function buildTargetUrl(request) {
  const backendOrigin = getBackendOrigin();
  const slug = Array.isArray(request.query.path)
    ? request.query.path.join('/')
    : request.query.path || '';
  const targetUrl = new URL(`/api/${slug}`, `${backendOrigin}/`);

  for (const [key, value] of Object.entries(request.query)) {
    if (key === 'path') {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        targetUrl.searchParams.append(key, item);
      }
      continue;
    }

    targetUrl.searchParams.set(key, value);
  }

  return targetUrl;
}

function copySafeHeaders(upstreamResponse, response) {
  upstreamResponse.headers.forEach((value, key) => {
    if (UNSAFE_RESPONSE_HEADERS.has(key.toLowerCase())) {
      return;
    }

    response.setHeader(key, value);
  });

  response.setHeader('Cache-Control', 'no-store');
}

export default async function handler(request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const targetUrl = buildTargetUrl(request);
    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers: {
        accept: request.headers.accept || '*/*',
        'accept-encoding': 'identity',
      },
    });

    copySafeHeaders(upstreamResponse, response);

    const contentType = upstreamResponse.headers.get('content-type');
    if (contentType) {
      response.setHeader('Content-Type', contentType);
    }

    const buffer = Buffer.from(await upstreamResponse.arrayBuffer());
    response.status(upstreamResponse.status).send(buffer);
  } catch (error) {
    response.status(502).json({
      error: 'Upstream request failed',
      message: error.message,
    });
  }
}
