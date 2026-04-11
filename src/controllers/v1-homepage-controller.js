import { getHomepageTemplate, sanitizeFragmentHtml } from '../utils/homepage-template.js';
import { successResponse } from '../utils/response.js';

export function createV1HomepageController(store, targetUrl) {
  return (_request, response) => {
    const snapshot = store.getHomepageSnapshot();
    const sanitizedHtmlBySectionId = Object.fromEntries(
      Object.entries(snapshot.htmlBySectionId ?? {}).map(([sectionId, html]) => [
        sectionId,
        sanitizeFragmentHtml(html, targetUrl),
      ]),
    );

    response.json(
      successResponse(
        {
          template: getHomepageTemplate(targetUrl),
          htmlBySectionId: sanitizedHtmlBySectionId,
          markets: store.getAllRecords(),
          candidateApis: snapshot.candidateApis,
          updatedAt: snapshot.updatedAt,
          lastScrapeAt: snapshot.lastScrapeAt,
          lastMarketUpdateAt: store.getLastUpdateAt(),
        },
        'Fetched homepage payload',
      ),
    );
  };
}
