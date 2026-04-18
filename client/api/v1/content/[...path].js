import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { proxyRequest } from '../../../lib/vercel-proxy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FALLBACK_HOMEPAGE_PATH = path.join(__dirname, '_fallback', 'homepage.json');

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

let cachedFallbackHomepage = null;
let cachedFallbackHomepageMtimeMs = 0;

function loadFallbackHomepage() {
  const stats = fs.statSync(FALLBACK_HOMEPAGE_PATH);
  if (cachedFallbackHomepage && cachedFallbackHomepageMtimeMs === stats.mtimeMs) {
    return cachedFallbackHomepage;
  }

  const nextValue = JSON.parse(fs.readFileSync(FALLBACK_HOMEPAGE_PATH, 'utf8'));
  cachedFallbackHomepage = nextValue;
  cachedFallbackHomepageMtimeMs = stats.mtimeMs;
  return nextValue;
}

async function fetchHomepageFromBackend(request) {
  const backendOrigin = getBackendOrigin();
  if (!backendOrigin) {
    throw new Error('RENDER_BACKEND_URL is not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getProxyTimeoutMs());
  try {
    const response = await fetch(`${backendOrigin}/api/v1/content/homepage`, {
      method: 'GET',
      headers: {
        accept: request.headers.accept || 'application/json',
        'accept-encoding': 'identity',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Upstream returned ${response.status}`);
    }

    return await response.json();
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
    try {
      const payload = await fetchHomepageFromBackend(request);
      response.setHeader('Cache-Control', 'no-store');
      response.status(200).json(payload);
      return;
    } catch {
      const fallbackHomepage = loadFallbackHomepage();
      response.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      response.status(200).json({
        success: true,
        data: fallbackHomepage,
        message: 'Fetched homepage content (fallback)',
        meta: {
          fallback: true,
        },
      });
      return;
    }
  }

  return proxyRequest(request, response, `/api/v1/content/${resolvedSegments.join('/')}`, {
    forceNoStore: false,
    omitQueryKeys: ['path'],
  });
}
