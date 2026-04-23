import { successResponse } from '../utils/response.js';

export function createV1ContentMarketController(contentService) {
  return async (request, response, next) => {
    try {
      const type = request.validatedParams?.type;
      const slug = request.validatedParams?.slug;
      const payload = contentService.getMarketContent(type, slug);
      response.setHeader(
        'Cache-Control',
        'public, max-age=60, s-maxage=120, stale-while-revalidate=600',
      );
      response.json(successResponse(payload, 'Fetched market content'));
    } catch (error) {
      next(error);
    }
  };
}
