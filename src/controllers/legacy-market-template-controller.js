import { applyStoreResultToMarketTemplate } from '../utils/market-template-payload.js';

export function createLegacyMarketTemplateController(marketTemplateService, store) {
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
      response.json(applyStoreResultToMarketTemplate(payload, matchedRecord));
    } catch (error) {
      next(error);
    }
  };
}
