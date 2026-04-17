import { successResponse } from '../utils/response.js';
import { mergeScraperAndMatkaRecords } from '../services/matka/matka-merge-service.js';

export function createV1MarketController(store, matkaService) {
  return async (request, response, next) => {
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
      const normalizedSlug = (request.validatedQuery?.slug || '').trim().toLowerCase();
      const normalizedName = (request.validatedQuery?.name || '').trim().toLowerCase();

      const filteredRecords = mergedRecords.filter((record) => {
        if (normalizedSlug && record.slug !== normalizedSlug) {
          return false;
        }

        if (normalizedName && !String(record.name ?? '').toLowerCase().includes(normalizedName)) {
          return false;
        }

        return true;
      });

      response.json(successResponse(filteredRecords, 'Fetched market records'));
    } catch (error) {
      next(error);
    }
  };
}
