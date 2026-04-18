import { proxyRequest } from '../../../lib/vercel-proxy.js';

function normalizeSegments(input) {
  const values = Array.isArray(input) ? input : [input];
  const segments = [];

  for (const raw of values) {
    for (const piece of String(raw ?? '').split('/')) {
      const cleaned = String(piece).trim().replace(/[^a-z0-9._%~@+-]/gi, '');
      if (cleaned) {
        segments.push(cleaned);
      }
    }
  }

  return segments;
}

function segmentsFromUrl(url = '') {
  try {
    const pathname = new URL(String(url || ''), 'http://localhost').pathname;
    const prefix = '/api/v1/content/';
    if (!pathname.startsWith(prefix)) {
      return [];
    }

    const rawTail = pathname.slice(prefix.length);
    if (!rawTail) {
      return [];
    }

    return normalizeSegments(rawTail.split('/').map((part) => decodeURIComponent(part)));
  } catch {
    return [];
  }
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

function getBackendOrigin() {
  return normalizeOrigin(process.env.RENDER_BACKEND_URL ?? '');
}

function getProxyTimeoutMs() {
  const parsed = Number.parseInt(String(process.env.PROXY_TIMEOUT_MS ?? ''), 10);
  if (Number.isFinite(parsed) && parsed >= 2000) {
    return parsed;
  }

  return 70_000;
}

function logEvent(level, message, payload = {}) {
  const emitter = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  emitter(
    JSON.stringify({
      scope: 'vercel-content-proxy',
      level,
      message,
      ...payload,
    }),
  );
}

function classifyFailure(error) {
  const name = String(error?.name ?? '').toLowerCase();
  const message = String(error?.message ?? '').toLowerCase();
  if (name === 'aborterror' || message.includes('timeout')) {
    return 'upstream_timeout';
  }
  return 'upstream_failure';
}

async function proxyHomepage(request, response) {
  const backendOrigin = getBackendOrigin();
  if (!backendOrigin) {
    response.status(503).json({
      success: false,
      data: null,
      message: 'Homepage backend is not configured',
      code: 'BACKEND_NOT_CONFIGURED',
    });
    return;
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getProxyTimeoutMs());

  try {
    const upstreamResponse = await fetch(`${backendOrigin}/api/v1/content/homepage`, {
      method: 'GET',
      headers: {
        accept: request.headers.accept || 'application/json',
        'accept-encoding': 'identity',
      },
      signal: controller.signal,
    });

    const payloadText = await upstreamResponse.text();
    const contentType = upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8';

    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', contentType);
    response.status(upstreamResponse.status).send(payloadText);

    if (!upstreamResponse.ok) {
      logEvent('warn', 'homepage_upstream_non_ok', {
        statusCode: upstreamResponse.status,
        durationMs: Date.now() - startedAt,
        readinessState: 'error',
        reason: 'upstream_non_ok',
      });
    }
  } catch (error) {
    const reason = classifyFailure(error);
    const statusCode = reason === 'upstream_timeout' ? 503 : 502;

    logEvent('error', 'homepage_upstream_failed', {
      reason,
      statusCode,
      durationMs: Date.now() - startedAt,
      readinessState: 'error',
      errorMessage: error?.message,
    });

    response.setHeader('Cache-Control', 'no-store');
    response.status(statusCode).json({
      success: false,
      data: null,
      message:
        reason === 'upstream_timeout'
          ? 'Homepage live API timed out'
          : 'Homepage live API request failed',
      code: reason === 'upstream_timeout' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_FAILED',
    });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(request, response) {
  const segments = normalizeSegments(request.query?.path);
  const resolvedSegments = segments.length > 0 ? segments : segmentsFromUrl(request.url);
  if (resolvedSegments.length === 0) {
    response.status(400).json({ error: 'Invalid content path' });
    return;
  }

  if (resolvedSegments.length === 1 && resolvedSegments[0] === 'homepage') {
    return proxyHomepage(request, response);
  }

  return proxyRequest(request, response, `/api/v1/content/${resolvedSegments.join('/')}`, {
    forceNoStore: false,
    omitQueryKeys: ['path'],
  });
}
