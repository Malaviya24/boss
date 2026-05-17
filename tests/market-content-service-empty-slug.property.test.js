import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { normalizeMarketSlug } from '../src/utils/market-links.js';

/**
 * Property 12: Empty Slug Rejection
 * Validates: Requirement 8.2
 *
 * For any input string that normalizes to an empty string (containing no
 * alphanumeric characters or hyphens), the Market_Content_Service SHALL
 * reject the request with HTTP status 400.
 */

// Mock MongoDB models to avoid DB dependency
vi.mock('../src/models/market-content-market-model.js', () => ({
  MarketContentMarketModel: { findOne: () => ({ lean: () => Promise.resolve(null) }) },
}));
vi.mock('../src/models/market-chart-row-model.js', () => ({
  MarketChartRowModel: { find: () => ({ sort: () => ({ lean: () => Promise.resolve([]) }) }) },
}));
vi.mock('../src/models/market-meta-model.js', () => ({
  MarketMetaModel: { findOne: () => ({ lean: () => Promise.resolve(null) }) },
}));
vi.mock('../src/services/market-content/market-page-scraper.js', () => ({
  scrapeAndParseMarketPage: vi.fn(),
}));

const { createMarketContentService } = await import(
  '../src/services/market-content/market-content-service.js'
);

describe('Property 12: Empty Slug Rejection', () => {
  let service;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createMarketContentService({
      scrapeEnabled: true,
      mongoEnabled: false,
      mode: 'legacy',
      legacyContentService: {
        getMarketContent: () => ({
          version: 2,
          type: 'jodi',
          slug: 'test',
          title: '',
          description: '',
          seo: { meta: [] },
          styles: { urls: [], blocks: [], jsonLdBlocks: [] },
          hero: {},
          result: {},
          controls: {},
          table: { columns: [], rows: [] },
          footer: {},
        }),
      },
    });
  });

  it('rejects with HTTP 400 and INVALID_MARKET_SLUG for any input that normalizes to empty', async () => {
    /**
     * Validates: Requirement 8.2
     *
     * normalizeMarketSlug strips all chars except [a-z0-9-], trims, and lowercases.
     * Any string containing ONLY characters outside [a-zA-Z0-9-] will normalize to empty.
     * The service must reject such inputs with statusCode 400.
     */

    // Generate strings that will normalize to empty.
    // Strategy: generate arbitrary strings and filter to those that normalize to empty,
    // plus explicit generators for known empty-normalizing patterns.
    const emptyNormalizingSlugArbitrary = fc.oneof(
      // Empty string
      fc.constant(''),
      // Whitespace-only strings
      fc.stringMatching(/^[\s]{1,20}$/),
      // Strings of special characters only (no alphanumeric or hyphen)
      fc.stringMatching(/^[!@#$%^&*()_+=\[\]{};:'",.<>?/\\|~`]{1,20}$/),
      // Unicode characters (non-ASCII, non-alphanumeric)
      fc.string().filter((s) => {
        // Only keep strings that normalize to empty and are <= 100 chars
        return s.length <= 100 && normalizeMarketSlug(s) === '';
      }),
      // Common special character strings
      fc.constantFrom(
        '!!!', '@#$%^&*()', '...', '___', '+++', '===',
        '   ', '\t\t', '☺☻♥♦♣♠', '你好世界', '.php'
      )
    );

    await fc.assert(
      fc.asyncProperty(emptyNormalizingSlugArbitrary, async (slug) => {
        // Precondition: skip inputs longer than 100 chars (rejected by length check first)
        fc.pre(String(slug ?? '').length <= 100);

        try {
          await service.getMarketContent('jodi', slug);
          // If it doesn't throw, the property is violated
          return false;
        } catch (error) {
          expect(error.statusCode).toBe(400);
          expect(error.code).toBe('INVALID_MARKET_SLUG');
          return true;
        }
      }),
      { numRuns: 200 }
    );
  });
});
