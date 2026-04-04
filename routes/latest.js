import { Router } from 'express';

export function createLatestRouter(store) {
  const router = Router();

  router.get('/', (_request, response) => {
    response.json({
      updatedAt: store.getLastUpdateAt(),
      lastScrapeAt: store.getLastScrapeAt(),
      records: store.getLatestUpdates(),
    });
  });

  return router;
}
