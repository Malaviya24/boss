import { successResponse } from '../utils/response.js';
import { applyStoreResultToMarketTemplate } from '../utils/market-template-payload.js';

export function createV1MarketTemplateController(marketTemplateService, store) {
  return async (request, response, next) => {
    try {
      const type = request.validatedParams?.type ?? request.validatedQuery?.type;
      const slug = request.validatedParams?.slug ?? request.validatedQuery?.slug;
      const payload = await marketTemplateService.getTemplate(
        type,
        slug,
        {
          offset: request.validatedQuery?.offset,
          limit: request.validatedQuery?.limit,
        },
      );

      const matchedRecord = store.getMarketRecords({ slug })[0] ?? null;
      const mergedPayload = applyStoreResultToMarketTemplate(payload, matchedRecord);
      response.setHeader(
        'Cache-Control',
        'public, max-age=60, s-maxage=120, stale-while-revalidate=600',
      );
      response.json(successResponse(mergedPayload, 'Fetched market template'));
    } catch (error) {
      next(error);
    }
  };
}
