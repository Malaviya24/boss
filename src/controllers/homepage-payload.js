import { getHomepageTemplate } from '../utils/homepage-template.js';

export function buildHomepagePayload(store, targetUrl, records = null) {
  const snapshot = store.getHomepageSnapshot();

  return {
    template: getHomepageTemplate(targetUrl),
    htmlBySectionId: snapshot.htmlBySectionId ?? {},
    markets: Array.isArray(records) ? records : store.getAllRecords(),
    candidateApis: snapshot.candidateApis,
    updatedAt: snapshot.updatedAt,
    lastScrapeAt: snapshot.lastScrapeAt,
    lastMarketUpdateAt: store.getLastUpdateAt(),
  };
}
