import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 7: Exclusion Guarantee
 * Validates: Requirements 4.1, 4.2
 *
 * For any market slug in the exclusion list, no HTTP request is ever made
 * to matkaking.boston (mock axios, assert zero outbound calls).
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

describe('Property 7: Exclusion Guarantee', () => {
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

  it('never calls scrapeAndParseMarketPage for any slug in the exclusion list', async () => {
    await fc.assert(
      fc.asyncProperty(typeArbitrary, slugArbitrary, async (type, slug) => {
        mockScrapeAndParseMarketPage.mockReset();

        // Create a service where the generated slug is in the exclusion list
        const service = createMarketContentService({
          mode: 'legacy',
          scrapeEnabled: true,
          scrapeTimeoutMs: 5000,
          scrapeBaseUrl: 'https://matkaking.boston',
          scrapeExcludedSlugs: [slug],
          mongoEnabled: false,
          legacyContentService: {
            getMarketContent: (t, s) => makeLegacyContent(t, s),
          },
        });

        // Call getMarketContent for the excluded slug
        await service.getMarketContent(type, slug);

        // The scraper must NEVER be called for an excluded slug
        expect(mockScrapeAndParseMarketPage).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it('never calls scrapeAndParseMarketPage for excluded slugs regardless of repeated requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        typeArbitrary,
        slugArbitrary,
        fc.integer({ min: 2, max: 5 }),
        async (type, slug, requestCount) => {
          mockScrapeAndParseMarketPage.mockReset();

          const service = createMarketContentService({
            mode: 'legacy',
            scrapeEnabled: true,
            scrapeTimeoutMs: 5000,
            scrapeBaseUrl: 'https://matkaking.boston',
            scrapeExcludedSlugs: [slug],
            mongoEnabled: false,
            cacheTtlMs: 1000, // short TTL
            legacyContentService: {
              getMarketContent: (t, s) => makeLegacyContent(t, s),
            },
          });

          // Make multiple requests for the excluded slug
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
});
