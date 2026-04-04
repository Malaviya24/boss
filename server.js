import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createScraper } from './scraper.js';
import { createLogger } from './utils/logger.js';
import { startScrapeScheduler } from './utils/scheduler.js';
import { createStateStore } from './store/index.js';
import { createAllRouter } from './routes/all.js';
import { createLatestRouter } from './routes/latest.js';
import { createHistoryRouter } from './routes/history.js';
import { createHomepageRouter } from './routes/homepage.js';
import { getCloneCss } from './utils/homepage-template.js';
import {
  closeSocketServer,
  emitHomepageUpdate,
  emitUpdateAll,
  initializeSocketServer,
} from './socket.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = createLogger('server');

const port = Number.parseInt(process.env.PORT ?? '4000', 10);
const targetUrl = process.env.TARGET_URL ?? 'https://dpboss.boston/';
const scrapeIntervalMs = Number.parseInt(
  process.env.SCRAPE_INTERVAL_MS ?? '5000',
  10,
);
const scrapeTimeoutMs = Number.parseInt(
  process.env.SCRAPE_TIMEOUT_MS ?? '30000',
  10,
);
const maxHistoryLength = Number.parseInt(
  process.env.MAX_HISTORY_LENGTH ?? '50',
  10,
);
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

function applySecurityHeaders(request, response, next) {
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );

  if (process.env.NODE_ENV === 'production') {
    response.setHeader(
      'Strict-Transport-Security',
      'max-age=15552000; includeSubDomains',
    );
  }

  next();
}

async function bootstrap() {
  const store = await createStateStore({
    redisUrl: process.env.REDIS_URL,
    maxHistoryLength,
    logger,
  });

  const scraper = createScraper({
    targetUrl,
    timeoutMs: scrapeTimeoutMs,
    headless:
      process.env.PUPPETEER_HEADLESS === 'false'
        ? false
        : process.env.PUPPETEER_HEADLESS ?? 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    logger,
  });

  const app = express();
  const server = http.createServer(app);

  app.disable('x-powered-by');

  initializeSocketServer(server, {
    origin: allowedOrigins.join(','),
    logger,
  });

  app.use(applySecurityHeaders);
  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '10kb' }));
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/health', (_request, response) => {
    response.json({
      ok: true,
      lastScrapeAt: store.getLastScrapeAt(),
      lastUpdateAt: store.getLastUpdateAt(),
    });
  });

  app.get(['/clone.css', '/api/clone-css'], (_request, response) => {
    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.type('text/css').send(getCloneCss());
  });

  app.use('/api/all', createAllRouter(store));
  app.use('/api/latest', createLatestRouter(store));
  app.use('/api/history', createHistoryRouter(store));
  app.use('/api/homepage', createHomepageRouter(store, { targetUrl }));

  const clientDistPath = path.join(__dirname, 'client', 'dist');
  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));
    app.get('*', (request, response, next) => {
      if (
        request.path.startsWith('/api') ||
        request.path.startsWith('/socket.io') ||
        request.path === '/clone.css'
      ) {
        next();
        return;
      }

      response.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }

  app.use((error, _request, response, next) => {
    if (!error) {
      next();
      return;
    }

    logger.warn('request_rejected', {
      message: error.message,
    });

    response.status(403).json({
      error: 'Request blocked',
    });
  });

  const stopScheduler = startScrapeScheduler({
    scraper,
    store,
    intervalMs: scrapeIntervalMs,
    logger,
    onMarketsChange: (payload) => emitUpdateAll(payload),
    onHomepageChange: (payload) => emitHomepageUpdate(payload),
  });

  server.listen(port, () => {
    logger.info('server_listening', {
      port,
      scrapeIntervalMs,
      allowedOrigins,
    });
  });

  const shutdown = async (signal) => {
    logger.info('server_shutdown_started', { signal });
    stopScheduler();
    await scraper.close();
    await store.close();
    closeSocketServer();

    server.close(() => {
      logger.info('server_shutdown_complete', { signal });
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  logger.error('server_bootstrap_failed', {
    message: error.message,
    stack: error.stack,
  });
  process.exit(1);
});
