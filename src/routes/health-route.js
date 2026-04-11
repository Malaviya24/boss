import { Router } from 'express';

export function createHealthRouter(store) {
  const router = Router();

  router.get('/health', (_request, response) => {
    response.json({
      ok: true,
      lastScrapeAt: store.getLastScrapeAt(),
      lastUpdateAt: store.getLastUpdateAt(),
    });
  });

  return router;
}
