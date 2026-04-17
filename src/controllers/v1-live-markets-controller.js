import { successResponse } from '../utils/response.js';

export function createV1LiveMarketsController(matkaService) {
  return async (_request, response, next) => {
    try {
      const markets = await matkaService.listLiveMarkets();
      response.json(successResponse(markets, 'Fetched live markets'));
    } catch (error) {
      next(error);
    }
  };
}

export function createV1LiveMarketBySlugController(matkaService) {
  return async (request, response, next) => {
    try {
      const market = await matkaService.getLiveMarketBySlug(request.validatedParams.slug);
      response.json(successResponse(market, 'Fetched live market'));
    } catch (error) {
      next(error);
    }
  };
}
