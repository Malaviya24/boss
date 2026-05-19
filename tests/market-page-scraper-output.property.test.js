import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as cheerio from 'cheerio';
import {
  extractMetaTags,
  extractStyles,
  extractHero,
  extractResult,
  extractChartTable,
  extractFooter,
} from '../src/services/market-content/market-page-scraper.js';

/**
 * Property 4: Parser Produces Valid Structured Content
 * Validates: Requirements 2.3, 2.4, 3.1, 3.2
 *
 * For any valid HTML containing a chart table structure, the parser produces
 * a StructuredMarketContent object containing all required top-level fields
 * with correct types.
 */

/**
 * Generates a valid market type ('jodi' or 'panel').
 */
const marketTypeArb = fc.constantFrom('jodi', 'panel');

/**
 * Generates a valid normalized slug (lowercase letters, digits, hyphens).
 * Starts and ends with alphanumeric, contains only [a-z0-9-].
 */
const slugArb = fc
  .stringMatching(/^[a-z0-9][a-z0-9-]{0,20}[a-z0-9]$/)
  .filter((s) => s.length >= 2);

/**
 * Generates a simple text string (no HTML tags or special chars that break HTML).
 */
const safeTextArb = fc.stringMatching(/^[a-zA-Z0-9 ]{1,40}$/);

/**
 * Generates column header names for the chart table.
 */
const columnNameArb = fc.constantFrom('Date', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Open', 'Close', 'Jodi');

/**
 * Generates a cell value (short numeric or text).
 */
const cellValueArb = fc.stringMatching(/^[0-9]{1,5}$/);

/**
 * Generates a valid HTML page containing a chart table with arbitrary content.
 */
const chartPageHtmlArb = fc
  .record({
    type: marketTypeArb,
    slug: slugArb,
    title: safeTextArb,
    description: safeTextArb,
    chartTitle: safeTextArb,
    smallHeading: safeTextArb,
    introText: safeTextArb,
    columns: fc.array(columnNameArb, { minLength: 2, maxLength: 7 }),
    rowCount: fc.integer({ min: 1, max: 5 }),
    footerText: safeTextArb,
    brandTitle: safeTextArb,
  })
  .chain((params) => {
    // Generate rows based on column count
    const rowsArb = fc.array(
      fc.array(cellValueArb, {
        minLength: params.columns.length,
        maxLength: params.columns.length,
      }),
      { minLength: params.rowCount, maxLength: params.rowCount }
    );

    return rowsArb.map((rows) => ({ ...params, rows }));
  })
  .map((params) => {
    const tableClass = params.type === 'panel' ? 'panel-chart' : 'chart-table';
    const headerCells = params.columns.map((col) => `<th>${col}</th>`).join('');
    const dataRows = params.rows
      .map((row) => {
        const cells = row.map((val, i) => {
          const highlight = i === 1 ? ' class="r"' : '';
          return `<td${highlight}>${val}</td>`;
        });
        return `<tr>${cells.join('')}</tr>`;
      })
      .join('\n      ');

    return {
      type: params.type,
      slug: params.slug,
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="description" content="${params.description}">
  <meta property="og:title" content="${params.title}">
  <title>${params.title}</title>
  <link rel="stylesheet" href="/css/style.css">
  <style>.${tableClass} { width: 100%; }</style>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"}</script>
</head>
<body>
  <div class="logo">
    <a href="/"><img src="/images/logo.png" alt="Logo"></a>
  </div>
  <h1 class="chart-h1">${params.chartTitle}</h1>
  <p class="small-heading">${params.smallHeading}</p>
  <p class="para3">${params.introText}</p>
  <div class="chart-result">
    <div data-live-result-name>Market Name</div>
    <span data-live-result-value>123-45-678</span>
    <a data-refresh-button href="/refresh/${params.slug}">Refresh Result</a>
  </div>
  <div class="panel panel-info">
    <div class="panel-heading"><h1>${params.chartTitle} Chart</h1></div>
    <table class="${tableClass}" border="1">
      <tr>${headerCells}</tr>
      ${dataRows}
    </table>
  </div>
  <div class="footer-text-div">
    <p class="footer-para">${params.footerText}</p>
  </div>
  <footer>
    <div class="ftr-icon">${params.brandTitle}</div>
    <p>All Rights Reserved 2024</p>
  </footer>
  <a class="mp-btn" href="/matka-play">Play Matka</a>
</body>
</html>`,
    };
  });

/**
 * Assembles the full StructuredMarketContent from individual parser outputs,
 * mirroring what scrapeAndParseMarketPage does internally.
 */
function assembleStructuredContent($, type, slug) {
  const title = $('title').text().trim();
  const meta = extractMetaTags($);
  const styles = extractStyles($, 'https://matkaking.boston');
  const hero = extractHero($);
  const result = extractResult($, type, slug);
  const table = extractChartTable($, type);
  const footer = extractFooter($);

  const descriptionMeta = meta.find((m) => m.name === 'description');
  const description = descriptionMeta ? descriptionMeta.content : '';

  return {
    version: 2,
    type,
    slug,
    title,
    description,
    seo: { meta },
    styles,
    hero,
    result,
    controls: {
      topAnchorId: 'market-top',
      bottomAnchorId: 'market-bottom',
      goBottomLabel: 'Go to Bottom',
      goTopLabel: 'Go to Top',
    },
    table,
    footer,
  };
}

describe('Property 4: Parser Produces Valid Structured Content', () => {
  /**
   * **Validates: Requirements 2.3, 2.4, 3.1, 3.2**
   */
  it('output contains all required top-level fields with correct types for any valid chart HTML', () => {
    fc.assert(
      fc.property(chartPageHtmlArb, ({ type, slug, html }) => {
        const $ = cheerio.load(html, { decodeEntities: false });
        const content = assembleStructuredContent($, type, slug);

        // version must be number === 2
        expect(content.version).toBe(2);
        expect(typeof content.version).toBe('number');

        // type must be string matching input type
        expect(content.type).toBe(type);
        expect(typeof content.type).toBe('string');

        // slug must be string matching input slug
        expect(content.slug).toBe(slug);
        expect(typeof content.slug).toBe('string');

        // title must be a string
        expect(typeof content.title).toBe('string');

        // description must be a string
        expect(typeof content.description).toBe('string');

        // seo must be an object with meta array
        expect(content.seo).toBeDefined();
        expect(typeof content.seo).toBe('object');
        expect(Array.isArray(content.seo.meta)).toBe(true);

        // styles must be an object with urls array, blocks array, jsonLdBlocks array
        expect(content.styles).toBeDefined();
        expect(typeof content.styles).toBe('object');
        expect(Array.isArray(content.styles.urls)).toBe(true);
        expect(Array.isArray(content.styles.blocks)).toBe(true);
        expect(Array.isArray(content.styles.jsonLdBlocks)).toBe(true);

        // hero must be an object with logo object, chartTitle string, smallHeading string, introText string
        expect(content.hero).toBeDefined();
        expect(typeof content.hero).toBe('object');
        expect(typeof content.hero.logo).toBe('object');
        expect(typeof content.hero.chartTitle).toBe('string');
        expect(typeof content.hero.smallHeading).toBe('string');
        expect(typeof content.hero.introText).toBe('string');

        // result must be an object
        expect(content.result).toBeDefined();
        expect(typeof content.result).toBe('object');

        // controls must be an object with expected string fields
        expect(content.controls).toBeDefined();
        expect(typeof content.controls).toBe('object');
        expect(typeof content.controls.topAnchorId).toBe('string');
        expect(typeof content.controls.bottomAnchorId).toBe('string');
        expect(typeof content.controls.goBottomLabel).toBe('string');
        expect(typeof content.controls.goTopLabel).toBe('string');

        // table must be an object with title string, columns array, rows array, attrs object, headingAttrs object, titleAttrs object
        expect(content.table).toBeDefined();
        expect(typeof content.table).toBe('object');
        expect(typeof content.table.title).toBe('string');
        expect(Array.isArray(content.table.columns)).toBe(true);
        expect(Array.isArray(content.table.rows)).toBe(true);
        expect(typeof content.table.attrs).toBe('object');
        expect(typeof content.table.headingAttrs).toBe('object');
        expect(typeof content.table.titleAttrs).toBe('object');

        // table must have non-empty columns and rows since we generated valid chart HTML
        expect(content.table.columns.length).toBeGreaterThan(0);
        expect(content.table.rows.length).toBeGreaterThan(0);

        // footer must be an object with blocks array, brandTitle string, rightsLines array, matkaPlay object
        expect(content.footer).toBeDefined();
        expect(typeof content.footer).toBe('object');
        expect(Array.isArray(content.footer.blocks)).toBe(true);
        expect(typeof content.footer.brandTitle).toBe('string');
        expect(Array.isArray(content.footer.rightsLines)).toBe(true);
        expect(typeof content.footer.matkaPlay).toBe('object');
      }),
      { numRuns: 100 }
    );
  });

  it('table rows have correct cell structure for any valid chart HTML', () => {
    fc.assert(
      fc.property(chartPageHtmlArb, ({ type, slug, html }) => {
        const $ = cheerio.load(html, { decodeEntities: false });
        const content = assembleStructuredContent($, type, slug);

        for (const row of content.table.rows) {
          expect(typeof row.id).toBe('string');
          expect(typeof row.rowIndex).toBe('number');
          expect(Array.isArray(row.cells)).toBe(true);

          for (const cell of row.cells) {
            expect(typeof cell.id).toBe('string');
            expect(typeof cell.column).toBe('string');
            expect(typeof cell.text).toBe('string');
            expect(typeof cell.isHighlight).toBe('boolean');
            expect(typeof cell.className).toBe('string');
            expect(typeof cell.attrs).toBe('object');
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('seo meta entries have name and content strings for any valid chart HTML', () => {
    fc.assert(
      fc.property(chartPageHtmlArb, ({ type, slug, html }) => {
        const $ = cheerio.load(html, { decodeEntities: false });
        const content = assembleStructuredContent($, type, slug);

        for (const entry of content.seo.meta) {
          expect(typeof entry.name).toBe('string');
          expect(entry.name.length).toBeGreaterThan(0);
          expect(typeof entry.content).toBe('string');
          expect(entry.content.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 50 }
    );
  });
});
