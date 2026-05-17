import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

/**
 * Property 5: Empty or Invalid Responses Throw Errors
 * Validates: Requirement 2.6
 *
 * For any response that is empty string, null, undefined, or non-string,
 * `scrapeMarketPage` must throw an error.
 */

// Mock dependencies before importing the module under test
vi.mock('axios');
vi.mock('../../src/config/http-agents.js', () => ({
  getHttpAgents: () => ({ httpAgent: {}, httpsAgent: {} }),
}));
vi.mock('../../src/config/env.js', () => ({
  loadEnv: () => ({ marketScrapeBaseUrl: 'https://dpboss.boston' }),
}));

const { default: axios } = await import('axios');
const { scrapeMarketPage } = await import('../../src/services/market-content/market-page-scraper.js');

describe('Property 5: Empty or Invalid Responses Throw Errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scrapeMarketPage rejects for any empty, null, undefined, or non-string response', async () => {
    /**
     * Validates: Requirement 2.6
     *
     * For any value that is empty string (''), null, undefined, or not a string type,
     * calling scrapeMarketPage must throw an error (reject the promise).
     */
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(''),
          fc.constant(null),
          fc.constant(undefined),
          fc.integer(),
          fc.object(),
          fc.array(fc.anything()),
          fc.boolean()
        ),
        async (invalidValue) => {
          axios.get.mockResolvedValue({ data: invalidValue });

          await expect(
            scrapeMarketPage('jodi', 'test-slug')
          ).rejects.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });
});
