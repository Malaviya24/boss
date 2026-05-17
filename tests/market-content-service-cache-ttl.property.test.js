import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 9: Cache TTL Expiry
 * Validates: Requirements 6.1, 6.2
 *
 * For any cache entry and configured TTL value T, after time T has elapsed,
 * `readCache` returns null (cache miss), triggering re-resolution through
 * the Fallback_Chain.
 */

describe('Property 9: Cache TTL Expiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Arbitrary for valid TTL values within the accepted range (1000ms to 86400000ms)
  const ttlArbitrary = fc.integer({ min: 1000, max: 86400000 });

  // Arbitrary for valid market types
  const typeArbitrary = fc.constantFrom('jodi', 'panel');

  // Arbitrary for valid normalized slugs
  const slugArbitrary = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,29}$/);

  /**
   * Helper: creates a service with a mock legacy content service that returns
   * valid structured content for any (type, slug) pair.
   */
  function createServiceWithTtl(ttl, slug = 'test') {
    const { createMarketContentService } = require('../src/services/market-content/market-content-service.js');

    let callCount = 0;
    const legacyContentService = {
      getMarketContent: (type, requestedSlug) => {
        callCount++;
        return {
          version: 2,
          type,
          slug: requestedSlug,
          title: `Test Market ${callCount}`,
          description: 'Test description',
          seo: { meta: [] },
          styles: { urls: [], blocks: [], jsonLdBlocks: [] },
          hero: { logo: {}, chartTitle: '', smallHeading: '', introText: '' },
          result: { className: '', marketName: '', value: '', refreshLabel: '', refreshHref: '' },
          controls: { topAnchorId: '', bottomAnchorId: '', goBottomLabel: '', goTopLabel: '' },
          table: { title: '', columns: [], rows: [], attrs: {}, headingAttrs: {}, titleAttrs: {} },
          footer: { blocks: [], brandTitle: '', rightsLines: [], matkaPlay: {} },
          importedAt: null,
          updatedAt: null,
        };
      },
    };

    const service = createMarketContentService({
      mode: 'legacy',
      cacheTtlMs: ttl,
      mongoEnabled: false,
      scrapeEnabled: false,
      legacyContentService,
    });

    return { service, getCallCount: () => callCount };
  }

  it('after exactly TTL ms have elapsed, cache entry expires and content source is called again', async () => {
    await fc.assert(
      fc.asyncProperty(ttlArbitrary, typeArbitrary, slugArbitrary, async (ttl, type, slug) => {
        const { createMarketContentService } = await import('../src/services/market-content/market-content-service.js');

        let callCount = 0;
        const legacyContentService = {
          getMarketContent: (reqType, reqSlug) => {
            callCount++;
            return {
              version: 2,
              type: reqType,
              slug: reqSlug,
              title: `Market Call ${callCount}`,
              description: '',
              seo: { meta: [] },
              styles: { urls: [], blocks: [], jsonLdBlocks: [] },
              hero: { logo: {}, chartTitle: '', smallHeading: '', introText: '' },
              result: { className: '', marketName: '', value: '', refreshLabel: '', refreshHref: '' },
              controls: { topAnchorId: '', bottomAnchorId: '', goBottomLabel: '', goTopLabel: '' },
              table: { title: '', columns: [], rows: [], attrs: {}, headingAttrs: {}, titleAttrs: {} },
              footer: { blocks: [], brandTitle: '', rightsLines: [], matkaPlay: {} },
              importedAt: null,
              updatedAt: null,
            };
          },
        };

        const service = createMarketContentService({
          mode: 'legacy',
          cacheTtlMs: ttl,
          mongoEnabled: false,
          scrapeEnabled: false,
          legacyContentService,
        });

        // First call: populates cache (call count = 1)
        await service.getMarketContent(type, slug);
        expect(callCount).toBe(1);

        // Advance time by exactly TTL ms
        vi.advanceTimersByTime(ttl);

        // Second call: cache should be expired, content source called again (call count = 2)
        await service.getMarketContent(type, slug);
        expect(callCount).toBe(2);
      }),
      { numRuns: 100 },
    );
  });

  it('before TTL ms have elapsed, cache entry is still valid (cache hit)', async () => {
    await fc.assert(
      fc.asyncProperty(ttlArbitrary, typeArbitrary, slugArbitrary, async (ttl, type, slug) => {
        const { createMarketContentService } = await import('../src/services/market-content/market-content-service.js');

        let callCount = 0;
        const legacyContentService = {
          getMarketContent: (reqType, reqSlug) => {
            callCount++;
            return {
              version: 2,
              type: reqType,
              slug: reqSlug,
              title: `Market Call ${callCount}`,
              description: '',
              seo: { meta: [] },
              styles: { urls: [], blocks: [], jsonLdBlocks: [] },
              hero: { logo: {}, chartTitle: '', smallHeading: '', introText: '' },
              result: { className: '', marketName: '', value: '', refreshLabel: '', refreshHref: '' },
              controls: { topAnchorId: '', bottomAnchorId: '', goBottomLabel: '', goTopLabel: '' },
              table: { title: '', columns: [], rows: [], attrs: {}, headingAttrs: {}, titleAttrs: {} },
              footer: { blocks: [], brandTitle: '', rightsLines: [], matkaPlay: {} },
              importedAt: null,
              updatedAt: null,
            };
          },
        };

        const service = createMarketContentService({
          mode: 'legacy',
          cacheTtlMs: ttl,
          mongoEnabled: false,
          scrapeEnabled: false,
          legacyContentService,
        });

        // First call: populates cache (call count = 1)
        await service.getMarketContent(type, slug);
        expect(callCount).toBe(1);

        // Advance time by less than TTL (1ms less)
        if (ttl > 1) {
          vi.advanceTimersByTime(ttl - 1);

          // Second call: cache should still be valid (call count stays at 1)
          await service.getMarketContent(type, slug);
          expect(callCount).toBe(1);
        }
      }),
      { numRuns: 100 },
    );
  });
});
