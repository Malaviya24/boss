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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeOrigin(value = '') {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(withProtocol);
  return `${parsed.protocol}//${parsed.host}`;
}

function getBackendOrigin(request) {
  const configured = process.env.RENDER_BACKEND_URL?.trim();
  if (!configured) {
    throw new Error('RENDER_BACKEND_URL is not configured');
  }

  const origin = normalizeOrigin(configured);
  if (!origin) {
    throw new Error('RENDER_BACKEND_URL is invalid');
  }

  const incomingHost = String(
    request.headers['x-forwarded-host'] || request.headers.host || '',
  )
    .trim()
    .toLowerCase();
  const targetHost = new URL(origin).host.toLowerCase();
  if (incomingHost && incomingHost === targetHost) {
    throw new Error('RENDER_BACKEND_URL points to this same Vercel host');
  }

  return origin;
}

function getProxyTimeoutMs() {
  const parsed = Number.parseInt(String(process.env.PROXY_TIMEOUT_MS ?? ''), 10);
  if (Number.isFinite(parsed) && parsed >= 1000) {
    return parsed;
  }

  return 70_000;
}

function getProxyRetryCount() {
  const parsed = Number.parseInt(String(process.env.PROXY_RETRY_COUNT ?? ''), 10);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 3) {
    return parsed;
  }

  return 1;
}

function isRetryableProxyError(error) {
  const name = String(error?.name ?? '').toLowerCase();
  const code = String(error?.code ?? '').toLowerCase();
  const message = String(error?.message ?? '').toLowerCase();

  return (
    name === 'aborterror' ||
    code === 'ecconnreset' ||
    code === 'econnreset' ||
    code === 'etimedout' ||
    code === 'econnaborted' ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('socket') ||
    message.includes('timeout')
  );
}

async function fetchWithTimeout(url, options = {}, retryCount = 0) {
  const timeoutMs = getProxyTimeoutMs();

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } catch (error) {
      const shouldRetry = attempt < retryCount && isRetryableProxyError(error);
      if (!shouldRetry) {
        throw error;
      }
      await sleep(300 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('Upstream request failed');
}

async function fetchWithHardTimeout(url, options = {}, retryCount = 0) {
  const timeoutMs = getProxyTimeoutMs();
  let timer = null;

  try {
    return await Promise.race([
      fetchWithTimeout(url, options, retryCount),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Proxy hard timeout after ${timeoutMs}ms`));
        }, timeoutMs + 2000);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
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
    const backendOrigin = getBackendOrigin(request);
    const targetUrl = new URL(targetPath, `${backendOrigin}/`);
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

    const upstreamResponse = await fetchWithHardTimeout(targetUrl, {
      method: request.method,
      headers: {
        accept: request.headers.accept || '*/*',
        'accept-encoding': 'identity',
      },
    }, getProxyRetryCount());

    copySafeHeaders(upstreamResponse, response, { forceNoStore });

    const contentType = upstreamResponse.headers.get('content-type');
    if (contentType) {
      response.setHeader('Content-Type', contentType);
    }

    response.status(upstreamResponse.status);

    response.send(Buffer.from(await upstreamResponse.arrayBuffer()));
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
