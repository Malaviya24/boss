import { Router } from 'express';
import { getHomepageTemplate } from '../utils/homepage-template.js';

export function createHomepageRouter(store, { targetUrl }) {
  const router = Router();

  router.get('/', (_request, response) => {
    const snapshot = store.getHomepageSnapshot();

    response.json({
      template: getHomepageTemplate(targetUrl),
      htmlBySectionId: snapshot.htmlBySectionId,
      updatedAt: snapshot.updatedAt,
      lastScrapeAt: snapshot.lastScrapeAt,
    });
  });

  return router;
}
