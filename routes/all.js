import { Router } from 'express';

export function createAllRouter(store) {
  const router = Router();

  router.get('/', (_request, response) => {
    response.json(store.getAllRecords());
  });

  return router;
}
