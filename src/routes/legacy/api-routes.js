import { Router } from 'express';
import { createLegacyAllController } from '../../controllers/legacy-all-controller.js';
import { createLegacyLatestController } from '../../controllers/legacy-latest-controller.js';
import { createLegacyHistoryController } from '../../controllers/legacy-history-controller.js';
import { createLegacyMarketController } from '../../controllers/legacy-market-controller.js';
import { createLegacyHomepageController } from '../../controllers/legacy-homepage-controller.js';
import { validateQuery } from '../../middlewares/validate.js';
import { marketQuerySchema } from '../../models/validators.js';

export function createLegacyApiRouter({ store, targetUrl }) {
  const router = Router();

  router.get('/all', createLegacyAllController(store));
  router.get('/latest', createLegacyLatestController(store));
  router.get('/history', createLegacyHistoryController(store));
  router.get('/market', validateQuery(marketQuerySchema), createLegacyMarketController(store));
  router.get('/homepage', createLegacyHomepageController(store, targetUrl));

  return router;
}
