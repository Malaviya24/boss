import { Router } from 'express';

export function createMarketRouter(store) {
  const router = Router();

  router.get('/', (request, response) => {
    response.json(
      store.getMarketRecords({
        slug: request.query.slug,
        name: request.query.name,
      }),
    );
  });

  return router;
}
