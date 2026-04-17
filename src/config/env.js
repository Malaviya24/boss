import dotenv from 'dotenv';

dotenv.config();

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toList(value, fallback = []) {
  const raw = String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return raw.length > 0 ? raw : fallback;
}

function normalizeOrigin(origin = '') {
  const value = String(origin ?? '').trim();
  if (!value || value === '*') {
    return value;
  }
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function toOriginList(value, fallback = []) {
  return [...new Set(toList(value, fallback).map((origin) => normalizeOrigin(origin)).filter(Boolean))];
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

export function loadEnv() {
  const primaryTarget = process.env.TARGET_URL ?? 'https://dpboss.boston/';
  const scrapeTargets = toList(process.env.SCRAPE_TARGETS, [primaryTarget]);

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    isProduction: (process.env.NODE_ENV ?? 'development') === 'production',
    port: toInt(process.env.PORT, 4000),
    corsOrigins: toOriginList(process.env.CORS_ORIGIN, ['http://localhost:5173']),
    primaryTarget,
    scrapeTargets,
    scrapeIntervalMs: toInt(process.env.SCRAPE_INTERVAL_MS, 6000),
    scrapeTimeoutMs: toInt(process.env.SCRAPE_TIMEOUT_MS, 30000),
    scrapeRetries: toInt(process.env.SCRAPE_RETRIES, 2),
    scrapeRetryDelayMs: toInt(process.env.SCRAPE_RETRY_DELAY_MS, 1000),
    maxHistoryLength: toInt(process.env.MAX_HISTORY_LENGTH, 50),
    staleAfterMs: toInt(process.env.STALE_AFTER_MS, 1800000),
    apiRateLimitWindowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    apiRateLimitMax: toInt(process.env.RATE_LIMIT_MAX, 240),
    strictRateLimitMax: toInt(process.env.RATE_LIMIT_STRICT_MAX, 60),
    bodyLimit: process.env.BODY_LIMIT ?? '10kb',
    trustProxy: toBoolean(process.env.TRUST_PROXY, true),
    csrfToken: process.env.CSRF_TOKEN ?? '',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    enableSseHeartbeat: toBoolean(process.env.SSE_HEARTBEAT_ENABLED, true),
    sseHeartbeatMs: toInt(process.env.SSE_HEARTBEAT_MS, 15000),
    mongoUri: process.env.MONGODB_URI ?? '',
    jwtSecret: process.env.JWT_SECRET ?? '',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
    adminUsername: process.env.ADMIN_USERNAME ?? '',
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH ?? '',
    matkaTimezone: process.env.MATKA_TIMEZONE ?? 'Asia/Kolkata',
    matkaRevealLoadingMs: toInt(process.env.MATKA_REVEAL_LOADING_MS, 5000),
    matkaPreRevealLoadingMs: toInt(process.env.MATKA_PRE_REVEAL_LOADING_MS, 60_000),
  };
}
