import { Router } from 'express';
import { createV1AllController } from '../../controllers/v1-all-controller.js';
import { createV1LatestController } from '../../controllers/v1-latest-controller.js';
import { createV1HistoryController } from '../../controllers/v1-history-controller.js';
import { createV1MarketController } from '../../controllers/v1-market-controller.js';
import { createV1MarketTemplateController } from '../../controllers/v1-market-template-controller.js';
import { createV1HomepageController } from '../../controllers/v1-homepage-controller.js';
import { createV1StreamController } from '../../controllers/v1-stream-controller.js';
import { validateParams, validateQuery } from '../../middlewares/validate.js';
import {
  marketPageParamsSchema,
  marketQuerySchema,
  marketTemplateQuerySchema,
  marketTemplateRequestQuerySchema,
} from '../../models/validators.js';

export function createV1ApiRouter({ store, targetUrl, realtimeService, marketTemplateService }) {
  const router = Router();

  router.get('/all', createV1AllController(store));
  router.get('/latest', createV1LatestController(store));
  router.get('/history', createV1HistoryController(store));
  router.get('/market', validateQuery(marketQuerySchema), createV1MarketController(store));
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
  router.get('/homepage', createV1HomepageController(store, targetUrl));
  router.get('/stream', createV1StreamController(realtimeService));

  return router;
}
