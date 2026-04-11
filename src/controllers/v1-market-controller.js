import { successResponse } from '../utils/response.js';

export function createV1MarketController(store) {
  return (request, response) => {
    const records = store.getMarketRecords({
      slug: request.validatedQuery?.slug,
      name: request.validatedQuery?.name,
    });

    response.json(successResponse(records, 'Fetched market records'));
  };
}
