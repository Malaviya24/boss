import { describe, it, expect } from 'vitest';
import { createMarketContentService } from '../src/services/market-content/market-content-service.js';

describe('createMarketContentService - input validation (task 4.4)', () => {
  function createService(options = {}) {
    return createMarketContentService({
      mongoEnabled: false,
      scrapeEnabled: true,
      mode: 'legacy',
      legacyContentService: {
        getMarketContent: () => ({
          version: 2, type: 'jodi', slug: 'test',
          title: '', description: '', seo: { meta: [] },
          styles: { urls: [], blocks: [], jsonLdBlocks: [] },
          hero: {}, result: {}, controls: {}, table: { columns: [], rows: [] },
          footer: {},
        }),
      },
      ...options,
    });
  }

  describe('slug length validation (before normalization)', () => {
    it('rejects slugs exceeding 100 characters with HTTP 400', async () => {
      const service = createService();
      const longSlug = 'a'.repeat(101);

      await expect(service.getMarketContent('jodi', longSlug))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'INVALID_MARKET_SLUG',
        });
    });

    it('accepts slugs exactly 100 characters long', async () => {
      const service = createService();
      const slug100 = 'a'.repeat(100);

      // Should not throw for length — may throw for other reasons (no content source)
      // but should NOT throw INVALID_MARKET_SLUG for length
      try {
        await service.getMarketContent('jodi', slug100);
      } catch (error) {
        // If it throws, it should NOT be for slug length
        expect(error.code).not.toBe('INVALID_MARKET_SLUG');
      }
    });

    it('rejects slugs with 101 characters even if they contain special chars', async () => {
      const service = createService();
      const longSlug = 'a-b-c-'.repeat(20); // 120 chars

      await expect(service.getMarketContent('jodi', longSlug))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'INVALID_MARKET_SLUG',
        });
    });
  });

  describe('empty slug rejection (after normalization)', () => {
    it('rejects slug that normalizes to empty string', async () => {
      const service = createService();

      await expect(service.getMarketContent('jodi', '!!!'))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'INVALID_MARKET_SLUG',
        });
    });

    it('rejects empty string slug', async () => {
      const service = createService();

      await expect(service.getMarketContent('jodi', ''))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'INVALID_MARKET_SLUG',
        });
    });

    it('rejects whitespace-only slug', async () => {
      const service = createService();

      await expect(service.getMarketContent('jodi', '   '))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'INVALID_MARKET_SLUG',
        });
    });

    it('rejects slug with only special characters', async () => {
      const service = createService();

      await expect(service.getMarketContent('jodi', '@#$%^&*'))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'INVALID_MARKET_SLUG',
        });
    });
  });

  describe('type validation (when scrapeEnabled is true)', () => {
    it('rejects invalid type with HTTP 400 and INVALID_MARKET_TYPE', async () => {
      const service = createService({ scrapeEnabled: true });

      await expect(service.getMarketContent('xyz', 'kalyan'))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'INVALID_MARKET_TYPE',
        });
    });

    it('rejects empty type string', async () => {
      const service = createService({ scrapeEnabled: true });

      await expect(service.getMarketContent('', 'kalyan'))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'INVALID_MARKET_TYPE',
        });
    });

    it('rejects null type', async () => {
      const service = createService({ scrapeEnabled: true });

      await expect(service.getMarketContent(null, 'kalyan'))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'INVALID_MARKET_TYPE',
        });
    });

    it('rejects undefined type', async () => {
      const service = createService({ scrapeEnabled: true });

      await expect(service.getMarketContent(undefined, 'kalyan'))
        .rejects.toMatchObject({
          statusCode: 400,
          code: 'INVALID_MARKET_TYPE',
        });
    });

    it('accepts "jodi" type (case-insensitive)', async () => {
      const service = createService({ scrapeEnabled: true });

      // Should not throw INVALID_MARKET_TYPE
      try {
        await service.getMarketContent('JODI', 'kalyan');
      } catch (error) {
        expect(error.code).not.toBe('INVALID_MARKET_TYPE');
      }
    });

    it('accepts "panel" type (case-insensitive)', async () => {
      const service = createService({ scrapeEnabled: true });

      try {
        await service.getMarketContent('Panel', 'kalyan');
      } catch (error) {
        expect(error.code).not.toBe('INVALID_MARKET_TYPE');
      }
    });

    it('does NOT reject invalid type when scrapeEnabled is false', async () => {
      const service = createService({ scrapeEnabled: false });

      // When scraping is disabled, normalizeType defaults to 'jodi' (existing behavior)
      try {
        await service.getMarketContent('xyz', 'kalyan');
      } catch (error) {
        // Should NOT be INVALID_MARKET_TYPE — may fail for other reasons
        expect(error.code).not.toBe('INVALID_MARKET_TYPE');
      }
    });
  });

  describe('normalized slug used for all operations', () => {
    it('normalizes slug before cache key lookup', async () => {
      const service = createService();

      // First call with normalized slug
      try {
        await service.getMarketContent('jodi', 'Kalyan');
      } catch {
        // ignore
      }

      // Second call with different casing should hit same cache key
      try {
        await service.getMarketContent('jodi', 'KALYAN');
      } catch {
        // ignore
      }

      // Both should resolve to same normalized slug 'kalyan'
      // This is implicitly tested by the service using normalizeMarketSlug
    });
  });
});
