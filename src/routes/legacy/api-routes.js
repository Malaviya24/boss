import { Router } from 'express';
import { createLegacyAllController } from '../../controllers/legacy-all-controller.js';
import { createLegacyLatestController } from '../../controllers/legacy-latest-controller.js';
import { createLegacyHistoryController } from '../../controllers/legacy-history-controller.js';
import { createLegacyMarketController } from '../../controllers/legacy-market-controller.js';
import { createLegacyMarketTemplateController } from '../../controllers/legacy-market-template-controller.js';
import { createLegacyHomepageController } from '../../controllers/legacy-homepage-controller.js';
import { validateParams, validateQuery } from '../../middlewares/validate.js';
import {
  marketPageParamsSchema,
  marketQuerySchema,
  marketTemplateQuerySchema,
  marketTemplateRequestQuerySchema,
} from '../../models/validators.js';

export function createLegacyApiRouter({ store, targetUrl, marketTemplateService }) {
  const router = Router();

  router.get('/all', createLegacyAllController(store));
  router.get('/latest', createLegacyLatestController(store));
  router.get('/history', createLegacyHistoryController(store));
  router.get('/market', validateQuery(marketQuerySchema), createLegacyMarketController(store));
  router.get('/homepage', createLegacyHomepageController(store, targetUrl));
  router.get(
    '/market-template',
    validateQuery(marketTemplateRequestQuerySchema),
    createLegacyMarketTemplateController(marketTemplateService, store),
  );
  router.get(
    '/market-template/:type/:slug',
    validateParams(marketPageParamsSchema),
    validateQuery(marketTemplateQuerySchema),
    createLegacyMarketTemplateController(marketTemplateService, store),
  );

  return router;
}
