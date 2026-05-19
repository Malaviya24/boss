import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 10: Request Coalescing
 * Validates: Requirements 7.1, 7.2, 7.3
 *
 * For N concurrent requests to the same (type, slug) while cache is empty,
 * exactly 1 scrape request is made and all N callers receive the same result.
 */

// Mock MongoDB models to avoid DB dependency
vi.mock('../src/models/market-content-market-model.js', () => ({
  MarketContentMarketModel: {
    findOne: () => ({ lean: () => Promise.resolve(null) }),
  },
}));

vi.mock('../src/models/market-chart-row-model.js', () => ({
  MarketChartRowModel: {
    find: () => ({ sort: () => ({ lean: () => Promise.resolve([]) }) }),
  },
}));

vi.mock('../src/models/market-meta-model.js', () => ({
  MarketMetaModel: {
    findOne: () => ({ lean: () => Promise.resolve(null) }),
  },
}));

// Mock the scraper to return valid content after a small delay
const mockScrapeAndParse = vi.fn();
vi.mock('../src/services/market-content/market-page-scraper.js', () => ({
  scrapeAndParseMarketPage: (...args) => mockScrapeAndParse(...args),
}));

const { createMarketContentService } = await import(
  '../src/services/market-content/market-content-service.js'
);

describe('Property 10: Request Coalescing', () => {
  beforeEach(() => {
    mockScrapeAndParse.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Arbitrary for N concurrent requests (between 2 and 20)
  const concurrencyArbitrary = fc.integer({ min: 2, max: 20 });

  it('for N concurrent requests to the same (type, slug), exactly 1 scrape is made and all callers receive the same result', async () => {
    await fc.assert(
      fc.asyncProperty(concurrencyArbitrary, async (n) => {
        mockScrapeAndParse.mockReset();

        // Create a valid structured content payload
        const fakeContent = {
          version: 2,
          type: 'jodi',
          slug: 'kalyan',
          title: 'Kalyan Jodi Chart',
          description: 'Test description',
          seo: { meta: [] },
          styles: { urls: [], blocks: [], jsonLdBlocks: [] },
          hero: { logo: {}, chartTitle: '', smallHeading: '', introText: '' },
          result: {},
          controls: {
            topAnchorId: 'market-top',
            bottomAnchorId: 'market-bottom',
            goBottomLabel: 'Go to Bottom',
            goTopLabel: 'Go to Top',
          },
          table: { title: '', columns: [], rows: [], attrs: {}, headingAttrs: {}, titleAttrs: {} },
          footer: { blocks: [], brandTitle: '', rightsLines: [], matkaPlay: {} },
          importedAt: null,
          updatedAt: new Date().toISOString(),
        };

        // Mock scraper to return content after a small delay (simulates network latency)
        mockScrapeAndParse.mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve(fakeContent), 10)),
        );

        // Create a fresh service instance for each iteration (fresh cache)
        const service = createMarketContentService({
          scrapeEnabled: true,
          scrapeExcludedSlugs: [],
          scrapeTimeoutMs: 15000,
          scrapeBaseUrl: 'https://matkaking.boston',
          mongoEnabled: false,
          cacheTtlMs: 300000,
        });

        // Fire N concurrent requests for the same (type, slug)
        const promises = Array.from({ length: n }, () =>
          service.getMarketContent('jodi', 'kalyan'),
        );

        const results = await Promise.all(promises);

        // Assert: the mock scraper was called exactly 1 time
        expect(mockScrapeAndParse).toHaveBeenCalledTimes(1);

        // Assert: all N results are identical (same content)
        for (let i = 1; i < results.length; i++) {
          expect(results[i]).toEqual(results[0]);
        }

        // Assert: all results have the expected structure
        expect(results[0].version).toBe(2);
        expect(results[0].type).toBe('jodi');
        expect(results[0].slug).toBe('kalyan');
      }),
      { numRuns: 50 },
    );
  });
});
