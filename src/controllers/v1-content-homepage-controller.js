import { successResponse } from '../utils/response.js';

export function createV1ContentHomepageController(contentService, store, matkaService) {
  return async (_request, response, next) => {
    try {
      const snapshot = store.getHomepageSnapshot();
      let matkaCards = [];
      if (matkaService) {
        try {
          matkaCards = await matkaService.listLiveMarkets();
        } catch {
          matkaCards = [];
        }
      }
      const payload = contentService.getHomepageContent({
        htmlBySectionId: snapshot.htmlBySectionId ?? {},
        updatedAt: snapshot.updatedAt ?? null,
        lastScrapeAt: snapshot.lastScrapeAt ?? null,
        matkaCards,
      });

      response.json(successResponse(payload, 'Fetched homepage content'));
    } catch (error) {
      next(error);
    }
  };
}
