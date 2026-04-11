import { successResponse } from '../utils/response.js';

export function createV1LatestController(store) {
  return (_request, response) => {
    response.json(
      successResponse(
        {
          updatedAt: store.getLastUpdateAt(),
          lastScrapeAt: store.getLastScrapeAt(),
          records: store.getLatestUpdates(),
        },
        'Fetched latest market updates',
      ),
    );
  };
}
