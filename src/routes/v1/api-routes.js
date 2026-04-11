import { Router } from 'express';
import { createV1AllController } from '../../controllers/v1-all-controller.js';
import { createV1LatestController } from '../../controllers/v1-latest-controller.js';
import { createV1HistoryController } from '../../controllers/v1-history-controller.js';
import { createV1MarketController } from '../../controllers/v1-market-controller.js';
import { createV1HomepageController } from '../../controllers/v1-homepage-controller.js';
import { createV1StreamController } from '../../controllers/v1-stream-controller.js';
import { validateQuery } from '../../middlewares/validate.js';
import { marketQuerySchema } from '../../models/validators.js';

export function createV1ApiRouter({ store, targetUrl, realtimeService }) {
  const router = Router();

  router.get('/all', createV1AllController(store));
  router.get('/latest', createV1LatestController(store));
  router.get('/history', createV1HistoryController(store));
  router.get('/market', validateQuery(marketQuerySchema), createV1MarketController(store));
  router.get('/homepage', createV1HomepageController(store, targetUrl));
  router.get('/stream', createV1StreamController(realtimeService));

  return router;
}
