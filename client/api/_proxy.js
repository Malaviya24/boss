import { Readable } from 'node:stream';

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

function getProxyTimeoutMs() {
  const parsed = Number.parseInt(String(process.env.PROXY_TIMEOUT_MS ?? ''), 10);
  if (Number.isFinite(parsed) && parsed >= 1000) {
    return parsed;
  }

  return 15_000;
}

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = getProxyTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function copySafeHeaders(upstreamResponse, response, { forceNoStore = true } = {}) {
  upstreamResponse.headers.forEach((value, key) => {
    if (UNSAFE_RESPONSE_HEADERS.has(key.toLowerCase())) {
      return;
    }

    response.setHeader(key, value);
  });

  if (forceNoStore) {
    response.setHeader('Cache-Control', 'no-store');
  }
}

export async function proxyRequest(request, response, targetPath, options = {}) {
  const {
    methods = ['GET', 'HEAD'],
    forceNoStore = true,
    omitQueryKeys = [],
  } = options;

  if (!methods.includes(request.method)) {
    response.setHeader('Allow', methods.join(', '));
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const targetUrl = new URL(targetPath, `${getBackendOrigin()}/`);
    const omitSet = new Set(omitQueryKeys.map((key) => String(key)));

    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (omitSet.has(String(key))) {
        continue;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          targetUrl.searchParams.append(key, item);
        }
        continue;
      }

      if (typeof value === 'string') {
        targetUrl.searchParams.set(key, value);
      }
    }

    const upstreamResponse = await fetchWithTimeout(targetUrl, {
      method: request.method,
      headers: {
        accept: request.headers.accept || '*/*',
      },
    });

    copySafeHeaders(upstreamResponse, response, { forceNoStore });

    const contentType = upstreamResponse.headers.get('content-type');
    if (contentType) {
      response.setHeader('Content-Type', contentType);
    }

    response.status(upstreamResponse.status);

    if (!upstreamResponse.body) {
      response.send(Buffer.from(await upstreamResponse.arrayBuffer()));
      return;
    }

    Readable.fromWeb(upstreamResponse.body).pipe(response);
  } catch (error) {
    const isAbort = String(error?.name ?? '').toLowerCase() === 'aborterror';
    response.status(502).json({
      error: isAbort ? 'Upstream request timeout' : 'Upstream request failed',
      message: error.message,
    });
  }
}

export async function proxyApiRequest(request, response, apiPath) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }
  return proxyRequest(request, response, apiPath, { forceNoStore: true });
}
