import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Integration tests for MarketContentService
 * Tests the full flow: request → scrape → parse → cache → serve
 * with mocked external dependencies (scraper and MongoDB).
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6, 4.1, 5.1, 7.1
 */

// Mock the scraper module
const mockScrapeAndParse = vi.fn();
vi.mock('../src/services/market-content/market-page-scraper.js', () => ({
  scrapeAndParseMarketPage: (...args) => mockScrapeAndParse(...args),
  scrapeMarketPage: vi.fn(),
}));

// Mock MongoDB models
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
 * Creates a valid StructuredMarketContent object for testing.
 */
function makeScrapedContent(type, slug) {
  return {
    version: 2,
    type,
    slug,
    title: `${slug} ${type} chart`,
    description: `Description for ${slug}`,
    seo: { meta: [{ name: 'description', content: `${slug} chart` }] },
    styles: { urls: ['https://example.com/style.css'], blocks: ['.chart { color: red; }'], jsonLdBlocks: [] },
    hero: { logo: { src: '/img/logo.png', alt: 'matkaking', href: '/' }, chartTitle: `${slug.toUpperCase()} CHART`, smallHeading: 'Records', introText: 'Welcome' },
    result: { className: 'chart-result', marketName: slug.toUpperCase(), value: '123-45-678', refreshLabel: 'Refresh Result', refreshHref: '#' },
    controls: { topAnchorId: 'market-top', bottomAnchorId: 'market-bottom', goBottomLabel: 'Go to Bottom', goTopLabel: 'Go to Top' },
    table: {
      title: `${slug.toUpperCase()} JODI CHART`,
      columns: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      rows: [{ id: '0', rowIndex: 0, cells: [{ id: '0', column: 'Mon', text: '12', isHighlight: false, className: '', attrs: {} }] }],
      attrs: { class: 'chart-table' },
      headingAttrs: {},
      titleAttrs: {},
    },
    footer: { blocks: [{ tag: 'p', className: '', text: 'Footer text' }], brandTitle: 'matkaking', rightsLines: ['All Rights Reserved'], matkaPlay: { label: 'Matka Play', href: '/' } },
    importedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Creates a valid MongoDB market document for testing.
 */
function makeMongoMarket(type, slug) {
  return {
    _id: `market-${type}-${slug}`,
    type,
    slug,
    name: slug,
    isActive: true,
    importSource: 'scrape',
    importedAt: null,
    updatedAt: null,
  };
}

/**
 * Creates a valid MongoDB meta document for testing.
 */
function makeMongoMeta(type, slug) {
  return {
    title: `${slug} ${type} chart (mongo)`,
    description: `MongoDB content for ${slug}`,
    seo: { meta: [] },
    styleUrls: [],
    styleBlocks: [],
    jsonLdBlocks: [],
    hero: { logo: { src: '/img/logo.png', alt: 'matkaking', href: '/' }, chartTitle: '', smallHeading: '', introText: '' },
    result: { className: 'chart-result', marketName: slug.toUpperCase(), value: '***-**-***', refreshLabel: 'Refresh', refreshHref: '#' },
    controls: { topAnchorId: 'market-top', bottomAnchorId: 'market-bottom', goBottomLabel: 'Go to Bottom', goTopLabel: 'Go to Top' },
    table: { title: '', columns: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], attrs: {}, headingAttrs: {}, titleAttrs: {} },
    footer: { blocks: [], brandTitle: 'matkaking', rightsLines: ['All Rights Reserved'], matkaPlay: { label: 'Play', href: '/' } },
    updatedAt: null,
  };
}

describe('MarketContentService Integration Tests', () => {
  beforeEach(() => {
    mockScrapeAndParse.mockReset();
    mockMarketFindOne.mockReset();
    mockMetaFindOne.mockReset();
    mockChartRowFind.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Full flow: request → scrape → cache → serve', () => {
    it('should scrape, cache, and return content on cache miss for non-excluded market', async () => {
      const type = 'jodi';
      const slug = 'kalyan';
      const scrapedContent = makeScrapedContent(type, slug);

      mockScrapeAndParse.mockResolvedValue(scrapedContent);

      const service = createMarketContentService({
        scrapeEnabled: true,
        scrapeTimeoutMs: 15000,
        scrapeBaseUrl: 'https://matkaking.boston',
        scrapeExcludedSlugs: [],
        mongoEnabled: true,
        cacheTtlMs: 300000,
      });

      const result = await service.getMarketContent(type, slug);

      // Scraper was called with correct arguments
      expect(mockScrapeAndParse).toHaveBeenCalledTimes(1);
      expect(mockScrapeAndParse).toHaveBeenCalledWith(type, slug, { timeoutMs: 15000 });

      // Result matches scraped content
      expect(result.version).toBe(2);
      expect(result.type).toBe(type);
      expect(result.slug).toBe(slug);
      expect(result.title).toBe(scrapedContent.title);
      expect(result.table.columns).toEqual(scrapedContent.table.columns);
      expect(result.footer.brandTitle).toBe('matkaking');
    });

    it('should return content with all required structured fields', async () => {
      const type = 'panel';
      const slug = 'milan-day';
      const scrapedContent = makeScrapedContent(type, slug);

      mockScrapeAndParse.mockResolvedValue(scrapedContent);

      const service = createMarketContentService({
        scrapeEnabled: true,
        scrapeTimeoutMs: 15000,
        scrapeBaseUrl: 'https://matkaking.boston',
        scrapeExcludedSlugs: [],
        mongoEnabled: true,
        cacheTtlMs: 300000,
      });

      const result = await service.getMarketContent(type, slug);

      // Verify all top-level fields exist with correct types
      expect(result.version).toBe(2);
      expect(typeof result.type).toBe('string');
      expect(typeof result.slug).toBe('string');
      expect(typeof result.title).toBe('string');
      expect(typeof result.description).toBe('string');
      expect(typeof result.seo).toBe('object');
      expect(Array.isArray(result.seo.meta)).toBe(true);
      expect(typeof result.styles).toBe('object');
      expect(Array.isArray(result.styles.urls)).toBe(true);
      expect(Array.isArray(result.styles.blocks)).toBe(true);
      expect(Array.isArray(result.styles.jsonLdBlocks)).toBe(true);
      expect(typeof result.hero).toBe('object');
      expect(typeof result.result).toBe('object');
      expect(typeof result.controls).toBe('object');
      expect(typeof result.table).toBe('object');
      expect(Array.isArray(result.table.columns)).toBe(true);
      expect(Array.isArray(result.table.rows)).toBe(true);
      expect(typeof result.footer).toBe('object');
    });
  });

  describe('Fallback: scrape failure → MongoDB content served', () => {
    it('should fall back to MongoDB when scrape fails', async () => {
      const type = 'jodi';
      const slug = 'milan-day';

      // Scrape fails
      mockScrapeAndParse.mockRejectedValue(new Error('Connection timeout'));

      // MongoDB succeeds
      mockMarketFindOne.mockResolvedValue(makeMongoMarket(type, slug));
      mockMetaFindOne.mockResolvedValue(makeMongoMeta(type, slug));
      mockChartRowFind.mockResolvedValue([]);

      const service = createMarketContentService({
        scrapeEnabled: true,
        scrapeTimeoutMs: 15000,
        scrapeBaseUrl: 'https://matkaking.boston',
        scrapeExcludedSlugs: [],
        mongoEnabled: true,
        cacheTtlMs: 300000,
      });

      const result = await service.getMarketContent(type, slug);

      // Scraper was attempted
      expect(mockScrapeAndParse).toHaveBeenCalledTimes(1);

      // MongoDB was used as fallback
      expect(mockMarketFindOne).toHaveBeenCalled();

      // Result is valid structured content from MongoDB
      expect(result.version).toBe(2);
      expect(result.type).toBe(type);
      expect(result.slug).toBe(slug);
      expect(result.title).toContain('mongo');
    });

    it('should fall back to legacy when both scrape and MongoDB fail', async () => {
      const type = 'panel';
      const slug = 'rajdhani-day';

      // Scrape fails
      mockScrapeAndParse.mockRejectedValue(new Error('Network error'));

      // MongoDB fails (market not found)
      mockMarketFindOne.mockResolvedValue(null);

      // Legacy service succeeds
      const legacyContent = makeScrapedContent(type, slug);
      legacyContent.title = 'Legacy content';
      const mockLegacyService = {
        getMarketContent: vi.fn().mockReturnValue(legacyContent),
      };

      const service = createMarketContentService({
        scrapeEnabled: true,
        scrapeTimeoutMs: 15000,
        scrapeBaseUrl: 'https://matkaking.boston',
        scrapeExcludedSlugs: [],
        mongoEnabled: true,
        cacheTtlMs: 300000,
        legacyContentService: mockLegacyService,
      });

      const result = await service.getMarketContent(type, slug);

      // All sources were attempted in order
      expect(mockScrapeAndParse).toHaveBeenCalledTimes(1);
      expect(mockMarketFindOne).toHaveBeenCalled();
      expect(mockLegacyService.getMarketContent).toHaveBeenCalled();

      // Result comes from legacy
      expect(result.version).toBe(2);
      expect(result.type).toBe(type);
      expect(result.slug).toBe(slug);
    });

    it('should throw 503 when all sources fail', async () => {
      const type = 'jodi';
      const slug = 'bombay-day';

      // All sources fail
      mockScrapeAndParse.mockRejectedValue(new Error('Scrape failed'));
      mockMarketFindOne.mockResolvedValue(null);

      const mockLegacyService = {
        getMarketContent: vi.fn().mockImplementation(() => { throw new Error('Legacy not found'); }),
      };

      const service = createMarketContentService({
        scrapeEnabled: true,
        scrapeTimeoutMs: 15000,
        scrapeBaseUrl: 'https://matkaking.boston',
        scrapeExcludedSlugs: [],
        mongoEnabled: true,
        cacheTtlMs: 300000,
        legacyContentService: mockLegacyService,
      });

      await expect(service.getMarketContent(type, slug)).rejects.toMatchObject({
        statusCode: 503,
      });
    });
  });

  describe('Excluded market: never hits scrape endpoint', () => {
    it('should never call scraper for excluded market slugs', async () => {
      const type = 'jodi';
      const slug = 'surat-night';

      // MongoDB succeeds for excluded market
      mockMarketFindOne.mockResolvedValue(makeMongoMarket(type, slug));
      mockMetaFindOne.mockResolvedValue(makeMongoMeta(type, slug));
      mockChartRowFind.mockResolvedValue([]);

      const service = createMarketContentService({
        scrapeEnabled: true,
        scrapeTimeoutMs: 15000,
        scrapeBaseUrl: 'https://matkaking.boston',
        scrapeExcludedSlugs: ['surat-night', 'surat-king'],
        mongoEnabled: true,
        cacheTtlMs: 300000,
      });

      const result = await service.getMarketContent(type, slug);

      // Scraper was NEVER called
      expect(mockScrapeAndParse).not.toHaveBeenCalled();

      // Content was served from MongoDB
      expect(result.version).toBe(2);
      expect(result.type).toBe(type);
      expect(result.slug).toBe(slug);
    });

    it('should never call scraper for excluded market even on multiple requests', async () => {
      const type = 'panel';
      const slug = 'surat-king';

      // MongoDB succeeds
      mockMarketFindOne.mockResolvedValue(makeMongoMarket(type, slug));
      mockMetaFindOne.mockResolvedValue(makeMongoMeta(type, slug));
      mockChartRowFind.mockResolvedValue([]);

      const service = createMarketContentService({
        scrapeEnabled: true,
        scrapeTimeoutMs: 15000,
        scrapeBaseUrl: 'https://matkaking.boston',
        scrapeExcludedSlugs: ['surat-night', 'surat-king'],
        mongoEnabled: true,
        cacheTtlMs: 1000,
      });

      // First request (cache miss → MongoDB)
      await service.getMarketContent(type, slug);
      // Clear cache to force re-resolution
      service.clearCache();
      // Second request (cache miss → MongoDB again)
      await service.getMarketContent(type, slug);

      // Scraper was NEVER called across both requests
      expect(mockScrapeAndParse).not.toHaveBeenCalled();
    });
  });

  describe('Concurrent requests: only one outbound scrape call', () => {
    it('should coalesce concurrent requests into a single scrape call', async () => {
      const type = 'jodi';
      const slug = 'kalyan';
      const scrapedContent = makeScrapedContent(type, slug);

      // Scraper resolves after a small delay to simulate network latency
      mockScrapeAndParse.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(scrapedContent), 20)),
      );

      const service = createMarketContentService({
        scrapeEnabled: true,
        scrapeTimeoutMs: 15000,
        scrapeBaseUrl: 'https://matkaking.boston',
        scrapeExcludedSlugs: [],
        mongoEnabled: true,
        cacheTtlMs: 300000,
      });

      // Fire 5 concurrent requests for the same market
      const promises = Array.from({ length: 5 }, () =>
        service.getMarketContent(type, slug),
      );

      const results = await Promise.all(promises);

      // Only one scrape call was made
      expect(mockScrapeAndParse).toHaveBeenCalledTimes(1);

      // All 5 callers received the same result
      for (const result of results) {
        expect(result.version).toBe(2);
        expect(result.type).toBe(type);
        expect(result.slug).toBe(slug);
        expect(result.title).toBe(scrapedContent.title);
      }
    });

    it('should propagate errors to all concurrent callers when scrape fails', async () => {
      const type = 'jodi';
      const slug = 'test-market';

      // Scraper fails after a delay
      mockScrapeAndParse.mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 20)),
      );

      // MongoDB also fails
      mockMarketFindOne.mockResolvedValue(null);

      const service = createMarketContentService({
        scrapeEnabled: true,
        scrapeTimeoutMs: 15000,
        scrapeBaseUrl: 'https://matkaking.boston',
        scrapeExcludedSlugs: [],
        mongoEnabled: true,
        cacheTtlMs: 300000,
      });

      // Fire 3 concurrent requests
      const promises = Array.from({ length: 3 }, () =>
        service.getMarketContent(type, slug).catch((err) => err),
      );

      const results = await Promise.all(promises);

      // Only one scrape call was made
      expect(mockScrapeAndParse).toHaveBeenCalledTimes(1);

      // All callers received an error
      for (const result of results) {
        expect(result).toBeInstanceOf(Error);
        expect(result.statusCode).toBe(503);
      }
    });
  });

  describe('Cache hit: second request served from cache without scrape', () => {
    it('should serve second request from cache without calling scraper again', async () => {
      const type = 'jodi';
      const slug = 'kalyan';
      const scrapedContent = makeScrapedContent(type, slug);

      mockScrapeAndParse.mockResolvedValue(scrapedContent);

      const service = createMarketContentService({
        scrapeEnabled: true,
        scrapeTimeoutMs: 15000,
        scrapeBaseUrl: 'https://matkaking.boston',
        scrapeExcludedSlugs: [],
        mongoEnabled: true,
        cacheTtlMs: 300000,
      });

      // First request — triggers scrape
      const result1 = await service.getMarketContent(type, slug);
      expect(mockScrapeAndParse).toHaveBeenCalledTimes(1);

      // Second request — should hit cache
      const result2 = await service.getMarketContent(type, slug);
      expect(mockScrapeAndParse).toHaveBeenCalledTimes(1); // Still only 1 call

      // Both results are equivalent
      expect(result1.version).toBe(result2.version);
      expect(result1.type).toBe(result2.type);
      expect(result1.slug).toBe(result2.slug);
      expect(result1.title).toBe(result2.title);
    });

    it('should serve different markets independently from cache', async () => {
      const scrapedKalyan = makeScrapedContent('jodi', 'kalyan');
      const scrapedMilan = makeScrapedContent('panel', 'milan-day');

      mockScrapeAndParse
        .mockResolvedValueOnce(scrapedKalyan)
        .mockResolvedValueOnce(scrapedMilan);

      const service = createMarketContentService({
        scrapeEnabled: true,
        scrapeTimeoutMs: 15000,
        scrapeBaseUrl: 'https://matkaking.boston',
        scrapeExcludedSlugs: [],
        mongoEnabled: true,
        cacheTtlMs: 300000,
      });

      // First requests for each market
      const result1 = await service.getMarketContent('jodi', 'kalyan');
      const result2 = await service.getMarketContent('panel', 'milan-day');
      expect(mockScrapeAndParse).toHaveBeenCalledTimes(2);

      // Second requests — both from cache
      const result3 = await service.getMarketContent('jodi', 'kalyan');
      const result4 = await service.getMarketContent('panel', 'milan-day');
      expect(mockScrapeAndParse).toHaveBeenCalledTimes(2); // No additional calls

      expect(result1.slug).toBe(result3.slug);
      expect(result2.slug).toBe(result4.slug);
    });
  });

  describe('Cache expiry: re-scrapes after TTL expires', () => {
    it('should re-scrape after cache TTL expires', async () => {
      vi.useFakeTimers();

      const type = 'jodi';
      const slug = 'kalyan';
      const scrapedContent = makeScrapedContent(type, slug);

      mockScrapeAndParse.mockResolvedValue(scrapedContent);

      const cacheTtlMs = 5000; // 5 seconds for testing
      const service = createMarketContentService({
        scrapeEnabled: true,
        scrapeTimeoutMs: 15000,
        scrapeBaseUrl: 'https://matkaking.boston',
        scrapeExcludedSlugs: [],
        mongoEnabled: true,
        cacheTtlMs,
      });

      // First request — triggers scrape
      await service.getMarketContent(type, slug);
      expect(mockScrapeAndParse).toHaveBeenCalledTimes(1);

      // Second request within TTL — cache hit
      vi.advanceTimersByTime(2000);
      await service.getMarketContent(type, slug);
      expect(mockScrapeAndParse).toHaveBeenCalledTimes(1);

      // Advance past TTL
      vi.advanceTimersByTime(4000); // Total: 6000ms > 5000ms TTL

      // Third request after TTL — should re-scrape
      await service.getMarketContent(type, slug);
      expect(mockScrapeAndParse).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });
});
