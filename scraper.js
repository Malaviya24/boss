import { scrapeHomepage } from './scraper/mainScraper.js';
import { createRecordKey, createSlug, parseResultParts } from './utils/normalize.js';
import { sanitizeFragmentHtml } from './utils/homepage-template.js';
import { retry } from './utils/retry.js';

export function createScraper({ targetUrl, timeoutMs, staleAfterMs, logger }) {
  return new MarketScraper({
    targetUrl,
    timeoutMs,
    staleAfterMs,
    logger,
  });
}

class MarketScraper {
  constructor({ targetUrl, timeoutMs, staleAfterMs, logger }) {
    this.targetUrl = targetUrl;
    this.timeoutMs = timeoutMs;
    this.staleAfterMs = staleAfterMs;
    this.logger = logger;
    this.homepageState = new Map();
  }

  async scrape() {
    return retry(
      async () => {
        const homepageSnapshot = await scrapeHomepage({
          targetUrl: this.targetUrl,
          timeoutMs: this.timeoutMs,
        });

        this.homepageState = new Map(
          homepageSnapshot.markets.map((market) => [
            createRecordKey(market.name, market.time),
            {
              number: market.number,
              links: market.links,
            },
          ]),
        );

        return {
          markets: homepageSnapshot.markets.map((market) => this.buildRecord(market)),
          homepage: {
            htmlBySectionId: this.buildHomepageSnapshot(homepageSnapshot.homepage),
            candidateApis: [],
          },
        };
      },
      {
        retries: 2,
        delayMs: 1000,
        onRetry: (error, attempt) => {
          this.logger.warn('scrape_retry', {
            attempt,
            message: error.message,
          });
        },
      },
    );
  }

  async close() {}

  buildRecord(market) {
    const key = createRecordKey(market.name, market.time);
    const slug = createSlug(market.name);
    const homepageParts = parseResultParts(market.number);

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
        number: homepageParts.number || market.number,
        jodi: homepageParts.jodi,
        panel: homepageParts.panel,
      },
      stale: false,
      stale_reason: null,
      source_index: market.source_index,
      group_index: market.group_index,
      changed_fields: [],
    };
  }

  buildHomepageSnapshot(htmlBySectionId) {
    return Object.fromEntries(
      Object.entries(htmlBySectionId ?? {}).map(([sectionId, html]) => [
        sectionId,
        sanitizeFragmentHtml(html, this.targetUrl),
      ]),
    );
  }
}
