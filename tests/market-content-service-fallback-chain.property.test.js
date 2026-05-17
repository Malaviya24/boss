import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 8: Fallback Chain Ordering
 * Validates: Requirements 5.1, 5.2, 5.3
 *
 * For any non-excluded market where scraping fails, MongoDB is attempted next;
 * if MongoDB fails and legacy exists, legacy is attempted;
 * if all fail, error with 503.
 */

// Call log to track the order of source attempts
let callLog = [];

// Mock the scraper — always fails to simulate scrape failure
const mockScrapeAndParse = vi.fn();
vi.mock('../src/services/market-content/market-page-scraper.js', () => ({
  scrapeAndParseMarketPage: (...args) => mockScrapeAndParse(...args),
  scrapeMarketPage: vi.fn(),
}));

// Mock MongoDB models with configurable behavior
const mockMarketFindOne = vi.fn();
const mockMetaFindOne = vi.fn();
const mockChartRowFind = vi.fn();

vi.mock('../src/models/market-content-market-model.js', () => ({
  MarketContentMarketModel: {
    findOne: (...args) => ({ lean: () => mockMarketFindOne(...args) }),
  },
}));

vi.mock('../src/models/market-chart-row-model.js', () => ({
  MarketChartRowModel: {
    find: (...args) => ({ sort: () => ({ lean: () => mockChartRowFind(...args) }) }),
  },
}));

vi.mock('../src/models/market-meta-model.js', () => ({
  MarketMetaModel: {
    findOne: (...args) => ({ lean: () => mockMetaFindOne(...args) }),
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

describe('Property 8: Fallback Chain Ordering', () => {
  // Arbitrary for valid normalized slugs (lowercase letters, digits, hyphens, 1-30 chars)
  const slugArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{0,29}$/);

  // Arbitrary for valid types
  const typeArbitrary = fc.constantFrom('jodi', 'panel');

  beforeEach(() => {
    callLog = [];
    mockScrapeAndParse.mockReset();
    mockMarketFindOne.mockReset();
    mockMetaFindOne.mockReset();
    mockChartRowFind.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('when scrape fails, MongoDB is attempted next and succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(typeArbitrary, slugArbitrary, async (type, slug) => {
        callLog = [];
        mockScrapeAndParse.mockReset();
        mockMarketFindOne.mockReset();
        mockMetaFindOne.mockReset();
        mockChartRowFind.mockReset();

        // Scrape always fails
        mockScrapeAndParse.mockImplementation(async () => {
          callLog.push('scrape');
          throw new Error('Scrape timeout');
        });

        // MongoDB succeeds — return valid market data
        mockMarketFindOne.mockImplementation(async (query) => {
          callLog.push('mongo');
          return {
            _id: 'market-id-123',
            type: query.type || type,
            slug: query.slug || slug,
            name: slug,
            isActive: true,
            importSource: 'scrape',
            importedAt: null,
            updatedAt: null,
          };
        });

        mockMetaFindOne.mockImplementation(async () => {
          return {
            title: `${slug} chart`,
            description: '',
            seo: { meta: [] },
            styleUrls: [],
            styleBlocks: [],
            jsonLdBlocks: [],
            hero: { logo: {}, chartTitle: '', smallHeading: '', introText: '' },
            result: {},
            controls: {
              topAnchorId: 'market-top',
              bottomAnchorId: 'market-bottom',
              goBottomLabel: 'Go to Bottom',
              goTopLabel: 'Go to Top',
            },
            table: { title: '', columns: [], attrs: {}, headingAttrs: {}, titleAttrs: {} },
            footer: { blocks: [], brandTitle: '', rightsLines: [], matkaPlay: {} },
            updatedAt: null,
          };
        });

        mockChartRowFind.mockImplementation(async () => []);

        const service = createMarketContentService({
          scrapeEnabled: true,
          scrapeTimeoutMs: 5000,
          scrapeBaseUrl: 'https://dpboss.boston',
          scrapeExcludedSlugs: [],
          mongoEnabled: true,
          cacheTtlMs: 1000,
        });

        const result = await service.getMarketContent(type, slug);

        // Scrape was attempted first, then MongoDB
        expect(callLog[0]).toBe('scrape');
        expect(callLog[1]).toBe('mongo');

        // Result is valid structured content
        expect(result.version).toBe(2);
        expect(result.type).toBe(type);
        expect(result.slug).toBe(slug);
      }),
      { numRuns: 50 },
    );
  });

  it('when scrape fails and MongoDB fails (recoverable), legacy is attempted next', async () => {
    await fc.assert(
      fc.asyncProperty(typeArbitrary, slugArbitrary, async (type, slug) => {
        callLog = [];
        mockScrapeAndParse.mockReset();
        mockMarketFindOne.mockReset();
        mockMetaFindOne.mockReset();
        mockChartRowFind.mockReset();

        // Scrape always fails
        mockScrapeAndParse.mockImplementation(async () => {
          callLog.push('scrape');
          throw new Error('Scrape network error');
        });

        // MongoDB fails with a recoverable error (market not found)
        mockMarketFindOne.mockImplementation(async () => {
          callLog.push('mongo');
          return null; // triggers MARKET_PAGE_NOT_FOUND AppError
        });

        // Legacy service succeeds
        const mockLegacyService = {
          getMarketContent: (t, s) => {
            callLog.push('legacy');
            return makeLegacyContent(t, s);
          },
        };

        const service = createMarketContentService({
          scrapeEnabled: true,
          scrapeTimeoutMs: 5000,
          scrapeBaseUrl: 'https://dpboss.boston',
          scrapeExcludedSlugs: [],
          mongoEnabled: true,
          cacheTtlMs: 1000,
          legacyContentService: mockLegacyService,
        });

        const result = await service.getMarketContent(type, slug);

        // Fallback chain order: scrape → mongo → legacy
        expect(callLog[0]).toBe('scrape');
        expect(callLog[1]).toBe('mongo');
        expect(callLog[2]).toBe('legacy');

        // Result is valid structured content from legacy
        expect(result.version).toBe(2);
        expect(result.type).toBe(type);
        expect(result.slug).toBe(slug);
      }),
      { numRuns: 50 },
    );
  });

  it('when all sources fail (scrape, MongoDB, legacy), throws error with 503', async () => {
    await fc.assert(
      fc.asyncProperty(typeArbitrary, slugArbitrary, async (type, slug) => {
        callLog = [];
        mockScrapeAndParse.mockReset();
        mockMarketFindOne.mockReset();
        mockMetaFindOne.mockReset();
        mockChartRowFind.mockReset();

        // Scrape fails
        mockScrapeAndParse.mockImplementation(async () => {
          callLog.push('scrape');
          throw new Error('Scrape failed');
        });

        // MongoDB fails with recoverable error
        mockMarketFindOne.mockImplementation(async () => {
          callLog.push('mongo');
          return null; // triggers MARKET_PAGE_NOT_FOUND AppError
        });

        // Legacy service also fails
        const mockLegacyService = {
          getMarketContent: () => {
            callLog.push('legacy');
            throw new Error('Legacy file not found');
          },
        };

        const service = createMarketContentService({
          scrapeEnabled: true,
          scrapeTimeoutMs: 5000,
          scrapeBaseUrl: 'https://dpboss.boston',
          scrapeExcludedSlugs: [],
          mongoEnabled: true,
          cacheTtlMs: 1000,
          legacyContentService: mockLegacyService,
        });

        let thrownError;
        try {
          await service.getMarketContent(type, slug);
        } catch (err) {
          thrownError = err;
        }

        // All three sources were attempted in order
        expect(callLog[0]).toBe('scrape');
        expect(callLog[1]).toBe('mongo');
        expect(callLog[2]).toBe('legacy');

        // Error is thrown with 503 status
        expect(thrownError).toBeDefined();
        expect(thrownError.statusCode).toBe(503);
      }),
      { numRuns: 50 },
    );
  });

  it('when scrape fails and MongoDB fails with no legacy service, throws 503', async () => {
    await fc.assert(
      fc.asyncProperty(typeArbitrary, slugArbitrary, async (type, slug) => {
        callLog = [];
        mockScrapeAndParse.mockReset();
        mockMarketFindOne.mockReset();
        mockMetaFindOne.mockReset();
        mockChartRowFind.mockReset();

        // Scrape fails
        mockScrapeAndParse.mockImplementation(async () => {
          callLog.push('scrape');
          throw new Error('Scrape timeout');
        });

        // MongoDB fails with recoverable error
        mockMarketFindOne.mockImplementation(async () => {
          callLog.push('mongo');
          return null; // triggers MARKET_PAGE_NOT_FOUND AppError
        });

        // No legacy service configured
        const service = createMarketContentService({
          scrapeEnabled: true,
          scrapeTimeoutMs: 5000,
          scrapeBaseUrl: 'https://dpboss.boston',
          scrapeExcludedSlugs: [],
          mongoEnabled: true,
          cacheTtlMs: 1000,
          legacyContentService: null,
        });

        let thrownError;
        try {
          await service.getMarketContent(type, slug);
        } catch (err) {
          thrownError = err;
        }

        // Scrape and MongoDB were attempted in order
        expect(callLog[0]).toBe('scrape');
        expect(callLog[1]).toBe('mongo');

        // Error is thrown with 503 status (no legacy to fall back to)
        expect(thrownError).toBeDefined();
        expect(thrownError.statusCode).toBe(503);
      }),
      { numRuns: 50 },
    );
  });
});
