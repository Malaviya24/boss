import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './config/env.js';
import { connectMongo, disconnectMongo } from './config/mongo.js';
import { createLogger } from './utils/logger.js';
import { createStateStore } from './services/state-store.js';
import { createScraperService } from './services/scraper/scraper-service.js';
import { createInMemoryScrapeService } from './services/queue/scrape-scheduler-fallback.js';
import { createRealtimeService } from './services/realtime/realtime-service.js';
import { buildSecurityMiddleware } from './middlewares/security.js';
import { requestContextMiddleware } from './middlewares/request-context.js';
import { createRequestLoggerMiddleware } from './middlewares/request-logger.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { createLegacyApiRouter } from './routes/legacy/api-routes.js';
import { createV1ApiRouter } from './routes/v1/api-routes.js';
import { createMarketPagesRouter } from './routes/market-pages.js';
import { createCloneCssRouter } from './routes/clone-css-route.js';
import { createHealthRouter } from './routes/health-route.js';
import { createMarketTemplateService } from './services/market-template-service.js';
import { createGeneratedContentService } from './services/content/generated-content-service.js';
import { createMatkaAuthService } from './services/matka/matka-auth-service.js';
import { createMatkaAuditService } from './services/matka/matka-audit-service.js';
import { createMatkaService } from './services/matka/matka-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function mountImageStatic(app) {
  const imageStaticRoots = [
    path.join(projectRoot, 'images', 'img'),
    path.join(projectRoot, 'images', 'newfev'),
    path.join(projectRoot, 'webzip', 'shared', 'panel', 'images'),
    path.join(projectRoot, 'webzip', 'shared', 'jodi', 'images'),
  ];

  for (const imageRoot of imageStaticRoots) {
    if (fs.existsSync(imageRoot)) {
      app.use('/images', express.static(imageRoot));
    }
  }

  const imgRoot = path.join(projectRoot, 'images', 'img');
  if (fs.existsSync(imgRoot)) {
    app.use('/img', express.static(imgRoot));
  }

  const newfevRoot = path.join(projectRoot, 'images', 'newfev');
  if (fs.existsSync(newfevRoot)) {
    app.use('/newfev', express.static(newfevRoot));
  }
}

function mountFrontendStatic(app) {
  const clientDistPath = path.join(projectRoot, 'client', 'dist');
  if (!fs.existsSync(clientDistPath)) {
    return;
  }

  app.use(express.static(clientDistPath));
  app.get('*', (request, response, next) => {
    if (
      request.path.startsWith('/api') ||
      request.path.startsWith('/socket.io') ||
      request.path.startsWith('/health') ||
      request.path === '/clone.css'
    ) {
      next();
      return;
    }

    if (request.path.startsWith('/admin-x-secure-portal')) {
      response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }

    response.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

export async function bootstrapApp() {
  const env = loadEnv();
  const logger = createLogger('server', { level: env.logLevel });
  const mongoState = await connectMongo({
    uri: env.mongoUri,
    logger,
  });

  const store = await createStateStore({
    maxHistoryLength: env.maxHistoryLength,
    logger,
  });

  const app = express();
  const server = http.createServer(app);

  if (env.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.disable('x-powered-by');

  const security = buildSecurityMiddleware(env, logger);
  const realtimeService = createRealtimeService({
    logger,
    corsOrigins: env.corsOrigins,
    heartbeatMs: env.sseHeartbeatMs,
    enableHeartbeat: env.enableSseHeartbeat,
  });

  realtimeService.initialize(server);

  app.use(requestContextMiddleware);
  app.use(createRequestLoggerMiddleware(logger));
  app.use(security.securityHeaders);
  app.use(security.customHeaders);
  app.use(security.compressionMiddleware);
  app.use(security.corsMiddleware);
  app.use(express.json({ limit: env.bodyLimit }));
  app.use(security.csrfGuard);

  app.use('/api', security.apiLimiter, (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/robots.txt', (_request, response) => {
    response.type('text/plain').send(
      ['User-agent: *', 'Disallow: /admin-x-secure-portal', 'Allow: /'].join('\n'),
    );
  });

  app.use(createHealthRouter(store));
  app.use(createCloneCssRouter());

  mountImageStatic(app);

  const marketPagesRouter = createMarketPagesRouter({
    webzipRoot: path.join(projectRoot, 'webzip'),
    logger,
  });
  const contentService = createGeneratedContentService({
    projectRoot,
    webzipRoot: path.join(projectRoot, 'webzip'),
    logger,
  });
  contentService.ensureArtifacts();
  const marketTemplateService = createMarketTemplateService({
    webzipRoot: path.join(projectRoot, 'webzip'),
    logger,
    liveFallbackEnabled: false,
  });
  const matkaAuthService = createMatkaAuthService({ env });
  const matkaService = createMatkaService({
    env: {
      ...env,
      mongoUri: mongoState.enabled ? env.mongoUri : '',
    },
  });
  const matkaAuditService = createMatkaAuditService({
    enabled: mongoState.enabled,
  });

  app.use('/api/market-page', marketPagesRouter);

  app.use(
    '/api/v1',
    security.strictLimiter,
    createV1ApiRouter({
      logger,
      store,
      targetUrl: env.primaryTarget,
      realtimeService,
      marketTemplateService,
      contentService,
      matkaService,
      matkaAuthService,
      matkaAuditService,
      adminLoginLimiter: security.adminLoginLimiter,
    }),
  );

  app.use(
    '/api',
    createLegacyApiRouter({
      store,
      targetUrl: env.primaryTarget,
      marketTemplateService,
      matkaService,
    }),
  );

  app.head('/', (_request, response) => {
    response.status(200).end();
  });

  mountFrontendStatic(app);

  app.use((error, _request, response, next) => {
    if (!error) {
      next();
      return;
    }

    if (error.message?.includes('CORS')) {
      response.status(403).json({ error: 'Request blocked' });
      return;
    }

    next(error);
  });

  app.use(notFoundHandler);
  app.use((error, request, response, next) => {
    logger.error('request_failed', {
      requestId: request.requestId,
      message: error.message,
      stack: error.stack,
      path: request.originalUrl,
      method: request.method,
    });
    errorHandler(error, request, response, next);
  });

  const scraperService = createScraperService({ env, logger });
  const commonScrapeHooks = {
    env,
    logger,
    scraperService,
    store,
    onMarketsChange: (payload) => {
      realtimeService.emit('update-all', payload);
      if (payload.byField.number.length > 0) {
        realtimeService.emit('update-number', {
          records: payload.byField.number,
          updatedAt: payload.updatedAt,
        });
      }
      if (payload.byField.jodi.length > 0) {
        realtimeService.emit('update-jodi', {
          records: payload.byField.jodi,
          updatedAt: payload.updatedAt,
        });
      }
      if (payload.byField.panel.length > 0) {
        realtimeService.emit('update-panel', {
          records: payload.byField.panel,
          updatedAt: payload.updatedAt,
        });
      }
    },
    onHomepageChange: (payload) => {
      realtimeService.emit('homepage-update', {
        ...payload,
      });
    },
  };

  const queueService = createInMemoryScrapeService(commonScrapeHooks);

  await new Promise((resolve) => {
    server.listen(env.port, '0.0.0.0', resolve);
  });

  queueService.start().catch((error) => {
    logger.error('scrape_scheduler_start_failed', {
      message: error.message,
      stack: error.stack,
    });
  });

  logger.info('server_listening', {
    port: env.port,
    scrapeIntervalMs: env.scrapeIntervalMs,
    scrapeTargets: env.scrapeTargets,
    corsOrigins: env.corsOrigins,
  });

  async function shutdown(signal) {
    logger.info('server_shutdown_started', { signal });
    await queueService.close().catch(() => undefined);
    await store.close().catch(() => undefined);
    await disconnectMongo({ logger }).catch(() => undefined);
    realtimeService.close();

    await new Promise((resolve) => {
      server.close(resolve);
    });

    logger.info('server_shutdown_complete', { signal });
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT').finally(() => process.exit(0));
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM').finally(() => process.exit(0));
  });

  return {
    app,
    server,
    shutdown,
  };
}
