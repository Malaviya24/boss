import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { normalizeMarketSlug } from '../src/utils/market-links.js';

/**
 * Property 11: Slug Normalization
 * Validates: Requirements 8.1, 10.2
 *
 * For any input string, the normalized output contains only lowercase letters,
 * digits, and hyphens. All other characters are stripped.
 */

describe('Property 11: Slug Normalization', () => {
  const VALID_SLUG_PATTERN = /^[a-z0-9-]*$/;

  it('normalized output contains only lowercase letters, digits, and hyphens for any string input', () => {
    /**
     * Validates: Requirements 8.1, 10.2
     */
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = normalizeMarketSlug(input);

        // Result must be empty string OR match the valid slug pattern
        expect(result).toMatch(VALID_SLUG_PATTERN);
      }),
      { numRuns: 1000 },
    );
  });

  it('normalized output contains only lowercase letters, digits, and hyphens for strings with special characters', () => {
    /**
     * Validates: Requirements 8.1, 10.2
     */
    fc.assert(
      fc.property(
        fc.stringMatching(/^[\x00-\x7F]{0,100}$/),
        (input) => {
          const result = normalizeMarketSlug(input);

          expect(result).toMatch(VALID_SLUG_PATTERN);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('normalized output never contains uppercase letters', () => {
    /**
     * Validates: Requirements 8.1, 10.2
     */
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Z\s!@#$%^&*()a-z0-9-]{0,50}$/),
        (input) => {
          const result = normalizeMarketSlug(input);

          expect(result).not.toMatch(/[A-Z]/);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('normalized output never contains whitespace or special characters', () => {
    /**
     * Validates: Requirements 8.1, 10.2
     */
    fc.assert(
      fc.property(
        fc.stringMatching(/^[\s\/\\?.#&=@!$%^*()_+~`|{}\[\]<>,"';:]{0,50}$/),
        (input) => {
          const result = normalizeMarketSlug(input);

          // No whitespace
          expect(result).not.toMatch(/\s/);
          // Only valid slug characters
          expect(result).toMatch(VALID_SLUG_PATTERN);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('normalized output never contains path separators or URL-unsafe characters', () => {
    /**
     * Validates: Requirements 8.1, 10.2
     */
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant('/path/to/something'),
          fc.constant('\\windows\\path'),
          fc.constant('slug?query=1'),
          fc.constant('slug#fragment'),
          fc.constant('hello world'),
          fc.constant('UPPERCASE-SLUG'),
          fc.constant('special!@#$%chars'),
          fc.constant('  trimmed  '),
          fc.constant('unicode-émojis-🎉'),
          fc.constant('dots...in...slug'),
          fc.string(),
        ),
        (input) => {
          const result = normalizeMarketSlug(input);

          expect(result).toMatch(VALID_SLUG_PATTERN);
        },
      ),
      { numRuns: 500 },
    );
  });
});
