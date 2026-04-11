import { getHomepageTemplate } from '../utils/homepage-template.js';

export function buildHomepagePayload(store, targetUrl) {
  const snapshot = store.getHomepageSnapshot();

  return {
    template: getHomepageTemplate(targetUrl),
    htmlBySectionId: snapshot.htmlBySectionId ?? {},
    markets: store.getAllRecords(),
    candidateApis: snapshot.candidateApis,
    updatedAt: snapshot.updatedAt,
    lastScrapeAt: snapshot.lastScrapeAt,
    lastMarketUpdateAt: store.getLastUpdateAt(),
  };
}
