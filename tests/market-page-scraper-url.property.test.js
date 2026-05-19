import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 3: URL Construction Follows Type-Based Pattern
 * Validates: Requirements 2.1, 2.2, 10.1
 *
 * For any valid type ('jodi' or 'panel') and any normalized slug matching
 * /^[a-z0-9-]+$/, the constructed URL must equal
 * {baseUrl}/{type}-chart-record/{slug}.php
 */

// Mock dependencies before importing the scraper
vi.mock('../src/config/env.js', () => ({
  loadEnv: () => ({
    marketScrapeBaseUrl: 'https://matkaking.boston',
  }),
}));

vi.mock('../src/config/http-agents.js', () => ({
  getHttpAgents: () => ({
    httpAgent: undefined,
    httpsAgent: undefined,
  }),
}));

// We'll mock axios to capture the URL
const mockAxiosGet = vi.fn();
vi.mock('axios', () => ({
  default: { get: (...args) => mockAxiosGet(...args) },
}));

const { scrapeMarketPage } = await import('../src/services/market-content/market-page-scraper.js');

describe('Property 3: URL Construction Follows Type-Based Pattern', () => {
  beforeEach(() => {
    mockAxiosGet.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Arbitrary for valid normalized slugs: lowercase letters, digits, and hyphens
  // Must be non-empty and match /^[a-z0-9-]+$/
  const slugArbitrary = fc.stringMatching(/^[a-z0-9-]{1,50}$/);

  // Arbitrary for valid types
  const typeArbitrary = fc.constantFrom('jodi', 'panel');

  it('constructs URL as {baseUrl}/{type}-chart-record/{slug}.php for any valid type and slug', () => {
    fc.assert(
      fc.property(typeArbitrary, slugArbitrary, (type, slug) => {
        const baseUrl = 'https://matkaking.boston';

        // Mock axios to resolve with valid HTML so we can capture the URL
        mockAxiosGet.mockResolvedValueOnce({
          data: '<html><head><title>Test</title></head><body></body></html>',
        });

        // Call scrapeMarketPage - it will call axios.get with the constructed URL
        scrapeMarketPage(type, slug, { timeoutMs: 5000 });

        // Verify the URL passed to axios.get
        expect(mockAxiosGet).toHaveBeenCalledTimes(1);

        const calledUrl = mockAxiosGet.mock.calls[0][0];
        const expectedPathPrefix = type === 'panel' ? 'panel-chart-record' : 'jodi-chart-record';
        const expectedUrl = `${baseUrl}/${expectedPathPrefix}/${slug}.php`;

        expect(calledUrl).toBe(expectedUrl);

        // Reset for next iteration
        mockAxiosGet.mockReset();
      }),
      { numRuns: 200 },
    );
  });
});
