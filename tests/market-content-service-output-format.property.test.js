import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 6: Output Format Invariant
 * Validates: Requirement 3.3
 *
 * For any content returned by the service regardless of source, the result
 * has `version === 2` and `type` and `slug` matching request parameters.
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
function makeValidContent(type, slug) {
  return {
    version: 2,
    type,
    slug,
    title: `${slug} chart`,
    description: `Description for ${slug}`,
    seo: { meta: [] },
    styles: { urls: [], blocks: [], jsonLdBlocks: [] },
    hero: { logo: {}, chartTitle: '', smallHeading: '', introText: '' },
    result: { className: '', marketName: '', value: '', refreshLabel: '', refreshHref: '' },
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

describe('Property 6: Output Format Invariant', () => {
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

  it('content from scrape source has version === 2 and type/slug matching request', async () => {
    await fc.assert(
      fc.asyncProperty(typeArbitrary, slugArbitrary, async (type, slug) => {
        mockScrapeAndParseMarketPage.mockReset();

        // Mock scraper to return valid content for the requested type/slug
        mockScrapeAndParseMarketPage.mockResolvedValue(makeValidContent(type, slug));

        const service = createMarketContentService({
          mode: 'mongo',
          scrapeEnabled: true,
          scrapeTimeoutMs: 5000,
          scrapeBaseUrl: 'https://dpboss.boston',
          scrapeExcludedSlugs: [],
          mongoEnabled: false,
          cacheTtlMs: 1000,
        });

        const result = await service.getMarketContent(type, slug);

        // Output format invariant: version must be 2
        expect(result.version).toBe(2);
        // Output format invariant: type must match the request type
        expect(result.type).toBe(type);
        // Output format invariant: slug must match the normalized request slug
        expect(result.slug).toBe(slug);
      }),
      { numRuns: 100 },
    );
  });

  it('content from legacy source has version === 2 and type/slug matching request', async () => {
    await fc.assert(
      fc.asyncProperty(typeArbitrary, slugArbitrary, async (type, slug) => {
        mockScrapeAndParseMarketPage.mockReset();

        // Mock scraper to fail so fallback to legacy is used
        mockScrapeAndParseMarketPage.mockRejectedValue(new Error('scrape failed'));

        const service = createMarketContentService({
          mode: 'legacy',
          scrapeEnabled: true,
          scrapeTimeoutMs: 5000,
          scrapeBaseUrl: 'https://dpboss.boston',
          scrapeExcludedSlugs: [],
          mongoEnabled: false,
          cacheTtlMs: 1000,
          legacyContentService: {
            getMarketContent: (t, s) => ({
              type: t,
              slug: s,
              title: `${s} legacy`,
              description: '',
              bodyNodes: [],
              tableModel: { columns: [], rows: [] },
            }),
          },
        });

        const result = await service.getMarketContent(type, slug);

        // Output format invariant: version must be 2
        expect(result.version).toBe(2);
        // Output format invariant: type must match the request type
        expect(result.type).toBe(type);
        // Output format invariant: slug must match the normalized request slug
        expect(result.slug).toBe(slug);
      }),
      { numRuns: 100 },
    );
  });

  it('content from any source always has version === 2 and matching type/slug regardless of source mode', async () => {
    // Arbitrary for source mode: scrape succeeds vs legacy fallback
    const sourceArbitrary = fc.constantFrom('scrape', 'legacy');

    await fc.assert(
      fc.asyncProperty(typeArbitrary, slugArbitrary, sourceArbitrary, async (type, slug, source) => {
        mockScrapeAndParseMarketPage.mockReset();

        if (source === 'scrape') {
          mockScrapeAndParseMarketPage.mockResolvedValue(makeValidContent(type, slug));
        } else {
          mockScrapeAndParseMarketPage.mockRejectedValue(new Error('scrape failed'));
        }

        const service = createMarketContentService({
          mode: 'legacy',
          scrapeEnabled: true,
          scrapeTimeoutMs: 5000,
          scrapeBaseUrl: 'https://dpboss.boston',
          scrapeExcludedSlugs: [],
          mongoEnabled: false,
          cacheTtlMs: 1000,
          legacyContentService: {
            getMarketContent: (t, s) => ({
              type: t,
              slug: s,
              title: `${s} legacy`,
              description: '',
              bodyNodes: [],
              tableModel: { columns: [], rows: [] },
            }),
          },
        });

        const result = await service.getMarketContent(type, slug);

        // Output format invariant holds regardless of source
        expect(result.version).toBe(2);
        expect(result.type).toBe(type);
        expect(result.slug).toBe(slug);
      }),
      { numRuns: 100 },
    );
  });
});
