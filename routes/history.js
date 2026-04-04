import { Router } from 'express';

export function createHistoryRouter(store) {
  const router = Router();

  router.get('/', (_request, response) => {
    response.json(store.getHistory());
  });

  return router;
}
