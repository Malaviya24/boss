import { buildHomepagePayload } from './homepage-payload.js';

export function createLegacyHomepageController(store, targetUrl) {
  return (_request, response) => {
    response.json(buildHomepagePayload(store, targetUrl));
  };
}
