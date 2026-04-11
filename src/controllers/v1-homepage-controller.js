import { successResponse } from '../utils/response.js';
import { buildHomepagePayload } from './homepage-payload.js';

export function createV1HomepageController(store, targetUrl) {
  return (_request, response) => {
    response.json(
      successResponse(
        buildHomepagePayload(store, targetUrl),
        'Fetched homepage payload',
      ),
    );
  };
}
