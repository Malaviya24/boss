import { scrapeHomepage } from './main-scraper.js';
import { retry } from '../../utils/retry.js';
import { createRecordKey, createSlug, parseResultParts } from '../../utils/normalize.js';
import { sanitizeFragmentHtml } from '../../utils/homepage-template.js';

export function createScraperService({ env, logger }) {
  return {
    async scrapeTarget(targetUrl, { namespace = '' } = {}) {
      const snapshot = await retry(
        async () =>
          scrapeHomepage({
            targetUrl,
            timeoutMs: env.scrapeTimeoutMs,
          }),
        {
          retries: env.scrapeRetries,
          delayMs: env.scrapeRetryDelayMs,
          onRetry: (error, attempt) => {
            logger.warn('scrape_retry', {
              targetUrl,
              attempt,
              message: error.message,
            });
          },
        },
      );

      return {
        markets: snapshot.markets.map((market) => buildRecord(market, namespace)),
        homepage: {
          htmlBySectionId: Object.fromEntries(
            Object.entries(snapshot.homepage ?? {}).map(([sectionId, html]) => [
              sectionId,
              sanitizeFragmentHtml(html, targetUrl),
            ]),
          ),
          candidateApis: snapshot.candidateApis ?? [],
        },
      };
    },
  };
}

function buildRecord(market, namespace = '') {
  const key = createRecordKey(market.name, market.time, namespace);
  const slug = createSlug(market.name);
  const parts = parseResultParts(market.number);

  return {
    key,
    slug,
    name: market.name,
    time: market.time,
    links: {
      jodi: market.links.jodi,
      panel: market.links.panel,
    },
    current: {
      number: parts.number || market.number,
      jodi: parts.jodi,
      panel: parts.panel,
    },
    stale: false,
    stale_reason: null,
    source_index: market.source_index,
    group_index: market.group_index,
    changed_fields: [],
  };
}
