import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 13: Scrape Disabled Bypasses Scraping
 * Validates: Requirement 9.6
 *
 * While `scrapeEnabled` is false, the service never invokes the scraper
 * and resolves from MongoDB/legacy only.
 */

// Track calls to the scraper
const mockScrapeAndParseMarketPage = vi.fn();

vi.mock('../src/services/market-content/market-page-scraper.js', () => ({
  scrapeAndParseMarketPage: (...args) => mockScrapeAndParseMarketPage(...args),
  scrapeMarketPage: vi.fn(),
}));

// Mock MongoDB models to avoid real DB connections
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

const { createMarketContentService } = await import(
  '../src/services/market-content/market-content-service.js'
);

/**
 * Creates a minimal valid StructuredMarketContent object for a given type and slug.
 */
function makeLegacyContent(type, slug) {
  return {
    version: 2,
    type,
    slug,
    title: `${slug} chart`,
    description: '',
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
    updatedAt: null,
  };
}

describe('Property 13: Scrape Disabled Bypasses Scraping', () => {
  beforeEach(() => {
    mockScrapeAndParseMarketPage.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Arbitrary for valid normalized slugs (lowercase letters, digits, hyphens, 1-30 chars)
  const slugArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/);

  // Arbitrary for valid types
  const typeArbitrary = fc.constantFrom('jodi', 'panel');

  it('never calls scrapeAndParseMarketPage when scrapeEnabled is false', async () => {
    await fc.assert(
      fc.asyncProperty(typeArbitrary, slugArbitrary, async (type, slug) => {
        mockScrapeAndParseMarketPage.mockReset();

        // Create a service with scrapeEnabled = false
        const service = createMarketContentService({
          mode: 'legacy',
          scrapeEnabled: false,
          scrapeTimeoutMs: 5000,
          scrapeBaseUrl: 'https://matkaking.boston',
          scrapeExcludedSlugs: [],
          mongoEnabled: false,
          legacyContentService: {
            getMarketContent: (t, s) => makeLegacyContent(t, s),
          },
        });

        // Call getMarketContent for any valid (type, slug)
        await service.getMarketContent(type, slug);

        // The scraper must NEVER be called when scrapeEnabled is false
        expect(mockScrapeAndParseMarketPage).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it('never calls scrapeAndParseMarketPage regardless of repeated requests when disabled', async () => {
    await fc.assert(
      fc.asyncProperty(
        typeArbitrary,
        slugArbitrary,
        fc.integer({ min: 2, max: 5 }),
        async (type, slug, requestCount) => {
          mockScrapeAndParseMarketPage.mockReset();

          const service = createMarketContentService({
            mode: 'legacy',
            scrapeEnabled: false,
            scrapeTimeoutMs: 5000,
            scrapeBaseUrl: 'https://matkaking.boston',
            scrapeExcludedSlugs: [],
            mongoEnabled: false,
            cacheTtlMs: 1000, // short TTL
            legacyContentService: {
              getMarketContent: (t, s) => makeLegacyContent(t, s),
            },
          });

          // Make multiple requests
          for (let i = 0; i < requestCount; i++) {
            await service.getMarketContent(type, slug);
          }

          // The scraper must NEVER be called regardless of how many requests
          expect(mockScrapeAndParseMarketPage).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 50 },
    );
  });

  it('resolves content from legacy when scrapeEnabled is false', async () => {
    await fc.assert(
      fc.asyncProperty(typeArbitrary, slugArbitrary, async (type, slug) => {
        mockScrapeAndParseMarketPage.mockReset();

        const service = createMarketContentService({
          mode: 'legacy',
          scrapeEnabled: false,
          scrapeTimeoutMs: 5000,
          scrapeBaseUrl: 'https://matkaking.boston',
          scrapeExcludedSlugs: [],
          mongoEnabled: false,
          legacyContentService: {
            getMarketContent: (t, s) => makeLegacyContent(t, s),
          },
        });

        // Call getMarketContent — should resolve from legacy
        const result = await service.getMarketContent(type, slug);

        // Verify content was resolved (not null/undefined)
        expect(result).toBeDefined();
        expect(result.version).toBe(2);
        expect(result.type).toBe(type);
        expect(result.slug).toBe(slug);

        // Scraper was never invoked
        expect(mockScrapeAndParseMarketPage).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});
