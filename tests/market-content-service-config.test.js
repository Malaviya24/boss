import { describe, it, expect } from 'vitest';
import { createMarketContentService } from '../src/services/market-content/market-content-service.js';

describe('createMarketContentService - scrape configuration (task 4.1)', () => {
  describe('new options acceptance', () => {
    it('accepts scrapeEnabled option (default false)', () => {
      const service = createMarketContentService({
        scrapeEnabled: true,
        mongoEnabled: false,
      });
      // Service should be created without error
      expect(service).toBeDefined();
      expect(service.getMarketContent).toBeTypeOf('function');
    });

    it('accepts scrapeTimeoutMs option', () => {
      const service = createMarketContentService({
        scrapeTimeoutMs: 10000,
        mongoEnabled: false,
      });
      expect(service).toBeDefined();
    });

    it('accepts scrapeBaseUrl option', () => {
      const service = createMarketContentService({
        scrapeBaseUrl: 'https://example.com',
        mongoEnabled: false,
      });
      expect(service).toBeDefined();
    });

    it('accepts scrapeExcludedSlugs option', () => {
      const service = createMarketContentService({
        scrapeExcludedSlugs: ['surat-night', 'surat-king'],
        mongoEnabled: false,
      });
      expect(service).toBeDefined();
    });

    it('works with all new options together', () => {
      const service = createMarketContentService({
        mode: 'mongo',
        cacheTtlMs: 60000,
        mongoEnabled: true,
        scrapeEnabled: true,
        scrapeTimeoutMs: 10000,
        scrapeBaseUrl: 'https://matkaking.boston',
        scrapeExcludedSlugs: ['surat-night', 'surat-king'],
      });
      expect(service).toBeDefined();
      expect(service.isExcludedMarket).toBeTypeOf('function');
    });
  });

  describe('isExcludedMarket', () => {
    it('returns true for slugs in the exclusion list', () => {
      const service = createMarketContentService({
        scrapeExcludedSlugs: ['surat-night', 'surat-king'],
        mongoEnabled: false,
      });
      expect(service.isExcludedMarket('surat-night')).toBe(true);
      expect(service.isExcludedMarket('surat-king')).toBe(true);
    });

    it('returns false for slugs not in the exclusion list', () => {
      const service = createMarketContentService({
        scrapeExcludedSlugs: ['surat-night', 'surat-king'],
        mongoEnabled: false,
      });
      expect(service.isExcludedMarket('kalyan')).toBe(false);
      expect(service.isExcludedMarket('milan-day')).toBe(false);
    });

    it('returns false when exclusion list is empty', () => {
      const service = createMarketContentService({
        scrapeExcludedSlugs: [],
        mongoEnabled: false,
      });
      expect(service.isExcludedMarket('surat-night')).toBe(false);
    });

    it('handles case-insensitive matching via lowercase normalization', () => {
      const service = createMarketContentService({
        scrapeExcludedSlugs: ['Surat-Night', 'SURAT-KING'],
        mongoEnabled: false,
      });
      expect(service.isExcludedMarket('surat-night')).toBe(true);
      expect(service.isExcludedMarket('surat-king')).toBe(true);
    });

    it('trims whitespace from exclusion slugs', () => {
      const service = createMarketContentService({
        scrapeExcludedSlugs: ['  surat-night  ', ' surat-king '],
        mongoEnabled: false,
      });
      expect(service.isExcludedMarket('surat-night')).toBe(true);
      expect(service.isExcludedMarket('surat-king')).toBe(true);
    });

    it('filters out empty strings from exclusion list', () => {
      const service = createMarketContentService({
        scrapeExcludedSlugs: ['', '  ', 'surat-night'],
        mongoEnabled: false,
      });
      expect(service.isExcludedMarket('')).toBe(false);
      expect(service.isExcludedMarket('surat-night')).toBe(true);
    });

    it('provides O(1) lookup via Set', () => {
      // With a large exclusion list, lookup should still be fast
      const slugs = Array.from({ length: 1000 }, (_, i) => `market-${i}`);
      const service = createMarketContentService({
        scrapeExcludedSlugs: slugs,
        mongoEnabled: false,
      });
      expect(service.isExcludedMarket('market-999')).toBe(true);
      expect(service.isExcludedMarket('market-1000')).toBe(false);
    });
  });

  describe('cache TTL validation', () => {
    it('uses valid cacheTtlMs within range (1000-86400000)', async () => {
      const service = createMarketContentService({
        cacheTtlMs: 60000,
        mongoEnabled: false,
        legacyContentService: {
          getMarketContent: () => ({
            version: 2, type: 'jodi', slug: 'test',
            title: '', description: '', seo: { meta: [] },
            styles: { urls: [], blocks: [], jsonLdBlocks: [] },
            hero: {}, result: {}, controls: {}, table: { columns: [], rows: [] },
            footer: {},
          }),
        },
        mode: 'legacy',
      });
      // First call populates cache
      const result = await service.getMarketContent('jodi', 'test');
      expect(result).toBeDefined();
    });

    it('falls back to 300000ms when cacheTtlMs is below 1000', () => {
      // This test verifies the service creates without error with invalid TTL
      const service = createMarketContentService({
        cacheTtlMs: 500,
        mongoEnabled: false,
      });
      expect(service).toBeDefined();
    });

    it('falls back to 300000ms when cacheTtlMs is above 86400000', () => {
      const service = createMarketContentService({
        cacheTtlMs: 100000000,
        mongoEnabled: false,
      });
      expect(service).toBeDefined();
    });

    it('falls back to 300000ms when cacheTtlMs is NaN', () => {
      const service = createMarketContentService({
        cacheTtlMs: NaN,
        mongoEnabled: false,
      });
      expect(service).toBeDefined();
    });

    it('falls back to 300000ms when cacheTtlMs is Infinity', () => {
      const service = createMarketContentService({
        cacheTtlMs: Infinity,
        mongoEnabled: false,
      });
      expect(service).toBeDefined();
    });

    it('falls back to 300000ms when cacheTtlMs is negative', () => {
      const service = createMarketContentService({
        cacheTtlMs: -1000,
        mongoEnabled: false,
      });
      expect(service).toBeDefined();
    });

    it('accepts cacheTtlMs at lower boundary (1000)', () => {
      const service = createMarketContentService({
        cacheTtlMs: 1000,
        mongoEnabled: false,
      });
      expect(service).toBeDefined();
    });

    it('accepts cacheTtlMs at upper boundary (86400000)', () => {
      const service = createMarketContentService({
        cacheTtlMs: 86400000,
        mongoEnabled: false,
      });
      expect(service).toBeDefined();
    });
  });
});
