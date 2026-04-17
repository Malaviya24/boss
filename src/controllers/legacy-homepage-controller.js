import { buildHomepagePayload } from './homepage-payload.js';
import { mergeScraperAndMatkaRecords } from '../services/matka/matka-merge-service.js';

export function createLegacyHomepageController(store, targetUrl, matkaService) {
  return async (_request, response, next) => {
    try {
      const records = store.getAllRecords();
      let matkaCards = [];
      if (matkaService) {
        try {
          matkaCards = await matkaService.listLiveMarkets();
        } catch {
          matkaCards = [];
        }
      }
      const mergedRecords = mergeScraperAndMatkaRecords(records, matkaCards);
      response.json(buildHomepagePayload(store, targetUrl, mergedRecords));
    } catch (error) {
      next(error);
    }
  };
}
