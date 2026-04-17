import { successResponse } from '../utils/response.js';
import { normalizeMarketSlug } from '../utils/market-links.js';

export function createV1ContentMarketController(contentService, matkaService) {
  return async (request, response, next) => {
    try {
      const type = request.validatedParams?.type;
      const slug = request.validatedParams?.slug;
      let payload;

      try {
        payload = contentService.getMarketContent(type, slug);
      } catch (error) {
        if (error?.code !== 'MARKET_PAGE_NOT_FOUND' || !matkaService) {
          throw error;
        }

        const normalizedSlug = normalizeMarketSlug(slug);
        if (!normalizedSlug) {
          throw error;
        }

        let matkaCards = [];
        try {
          matkaCards = await matkaService.listLiveMarkets();
        } catch {
          matkaCards = [];
        }

        const matchedMarket = matkaCards.find((card) => card.slug === normalizedSlug);
        if (!matchedMarket) {
          throw error;
        }

        payload = contentService.buildFallbackMarketContent(type, normalizedSlug, {
          marketName: matchedMarket.name,
          resultText: matchedMarket.resultText || 'Result Coming',
        });
      }

      response.json(successResponse(payload, 'Fetched market content'));
    } catch (error) {
      next(error);
    }
  };
}
