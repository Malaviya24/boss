import { Router } from 'express';
import { createV1AllController } from '../../controllers/v1-all-controller.js';
import { createV1LatestController } from '../../controllers/v1-latest-controller.js';
import { createV1HistoryController } from '../../controllers/v1-history-controller.js';
import { createV1MarketController } from '../../controllers/v1-market-controller.js';
import { createV1MarketTemplateController } from '../../controllers/v1-market-template-controller.js';
import { createV1HomepageController } from '../../controllers/v1-homepage-controller.js';
import { createV1StreamController } from '../../controllers/v1-stream-controller.js';
import { createV1ContentHomepageController } from '../../controllers/v1-content-homepage-controller.js';
import { createV1ContentMarketController } from '../../controllers/v1-content-market-controller.js';
import { createV1ContentMarketAssetController } from '../../controllers/v1-content-market-asset-controller.js';
import { createV1MatkaRoutes } from './matka-routes.js';
import { validateParams, validateQuery } from '../../middlewares/validate.js';
import {
  marketPageParamsSchema,
  marketQuerySchema,
  marketTemplateQuerySchema,
  marketTemplateRequestQuerySchema,
} from '../../models/validators.js';

export function createV1ApiRouter({
  logger,
  store,
  targetUrl,
  realtimeService,
  marketTemplateService,
  contentService,
  matkaService,
  matkaAuthService,
  matkaAuditService,
  adminLoginLimiter,
}) {
  const router = Router();

  router.get('/all', createV1AllController(store, matkaService));
  router.get('/latest', createV1LatestController(store));
  router.get('/history', createV1HistoryController(store));
  router.get('/market', validateQuery(marketQuerySchema), createV1MarketController(store, matkaService));
  router.get(
    '/market-template',
    validateQuery(marketTemplateRequestQuerySchema),
    createV1MarketTemplateController(marketTemplateService, store),
  );
  router.get(
    '/market-template/:type/:slug',
    validateParams(marketPageParamsSchema),
    validateQuery(marketTemplateQuerySchema),
    createV1MarketTemplateController(marketTemplateService, store),
  );
  router.get(
    '/content/homepage',
    createV1ContentHomepageController(contentService, store, matkaService, logger),
  );
  router.get(
    '/content/market/:type/:slug',
    validateParams(marketPageParamsSchema),
    createV1ContentMarketController(contentService, matkaService),
  );
  router.get(
    '/content/market/:type/:slug/asset/*',
    validateParams(marketPageParamsSchema),
    createV1ContentMarketAssetController(contentService),
  );
  router.get('/homepage', createV1HomepageController(store, targetUrl, matkaService));
  router.get('/stream', createV1StreamController(realtimeService));
  router.use(
    '/',
    createV1MatkaRoutes({
      matkaService,
      matkaAuthService,
      auditService: matkaAuditService,
      realtimeService,
      adminLoginLimiter,
    }),
  );

  return router;
}
