import axios from 'axios';
import * as cheerio from 'cheerio';
import { getHttpAgents } from '../../config/http-agents.js';
import { loadEnv } from '../../config/env.js';

// Slugs that are scraped from their own fixed URLs instead of jodi/panel-chart-record paths
const LOCAL_STATIC_SLUGS = new Map([
  ['main-bombay-36-bazar-chart', 'main-bombay-36-bazar-chart.php'],
  ['hs-online-bb-15-minutes-chart', 'hs-online-bb-15-minutes-chart.php'],
]);

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function getBaseUrl() {
  const env = loadEnv();
  return env.marketScrapeBaseUrl;
}

function buildScrapeUrl(type, slug, baseUrl) {
  // Special fixed pages — slug determines the URL directly
  if (slug === 'hs-online-bb-15-minutes-chart') {
    return `${baseUrl}/hs-online-bb-15-minutes-chart.php`;
  }
  if (slug === 'main-bombay-36-bazar-chart') {
    return `${baseUrl}/main-bombay-36-bazar-chart.php`;
  }
  const pathPrefix = type === 'panel' ? 'panel-chart-record' : 'jodi-chart-record';
  return `${baseUrl}/${pathPrefix}/${slug}.php`;
}

/**
 * Resolves a potentially relative URL to an absolute URL.
 * @param {string} value - The URL to resolve
 * @param {string} baseUrl - The base URL for resolution
 * @returns {string} Absolute URL or empty string
 */
export function toAbsoluteUrl(value, baseUrl) {
  if (!value) {
    return '';
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

/**
 * Normalizes text by collapsing whitespace and trimming.
 * Strips any residual HTML entities or tags for safety (Requirement 10.3).
 * @param {string} value - Raw text
 * @returns {string} Normalized plain text
 */
function normalizeText(value = '') {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-zA-Z0-9#]+;/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts cell text while preserving line breaks (<br>) as spaces.
 * The dpbossss.boston panel cells use <br> tags to stack 3 digits vertically
 * (e.g. "<td>1<br>6<br>7</td>" for panel "167") and date cells use
 * "<td>08/12/2025<br>to<br>14/12/2025</td>". The default cheerio .text()
 * concatenates without separator, mashing the values together. This helper
 * inserts a space at every <br> so the client can split parts later.
 *
 * @param {cheerio.CheerioAPI} $ - Cheerio instance
 * @param {cheerio.Element} el - <td> or <th> element
 * @returns {string} Normalized text with <br> boundaries preserved as spaces
 */
function extractCellText($, el) {
  if (!el) {
    return '';
  }

  // Replace <br> with a marker that survives html serialization, then
  // strip remaining tags via normalizeText.
  const $cell = $(el).clone();
  $cell.find('br').replaceWith(' \u0001 ');
  const html = $cell.html() ?? '';
  return normalizeText(html.replace(/\u0001/g, ' '));
}

/**
 * Extracts safe attributes from an element as a plain object.
 * Only includes string key-value pairs (no HTML content).
 * @param {cheerio.CheerioAPI} $ - Cheerio instance
 * @param {cheerio.Element} el - DOM element
 * @returns {object} Attribute key-value pairs
 */
function extractElementAttrs($, el) {
  if (!el || !el.attribs) {
    return {};
  }

  const attrs = {};
  for (const [key, value] of Object.entries(el.attribs)) {
    attrs[key] = String(value ?? '');
  }
  return attrs;
}

/**
 * Extracts <meta> tags with name/property and content attributes from the document head.
 * @param {cheerio.CheerioAPI} $ - Cheerio instance
 * @returns {Array<{name: string, content: string}>} Array of meta tag objects
 */
export function extractMetaTags($) {
  return $('head meta[name], head meta[property]').toArray().map((el) => ({
    name: $(el).attr('name') || $(el).attr('property') || '',
    content: $(el).attr('content') || '',
  })).filter((m) => m.name && m.content);
}

/**
 * Extracts stylesheet URLs, inline style blocks, and JSON-LD blocks.
 * @param {cheerio.CheerioAPI} $ - Cheerio instance
 * @param {string} baseUrl - Base URL for resolving relative stylesheet hrefs
 * @returns {{urls: string[], blocks: string[], jsonLdBlocks: string[]}}
 */
export function extractStyles($, baseUrl) {
  const urls = $('link[rel="stylesheet"]').toArray()
    .map((el) => toAbsoluteUrl($(el).attr('href'), baseUrl))
    .filter(Boolean);

  const blocks = $('style').toArray()
    .map((el) => $(el).html()?.trim())
    .filter(Boolean);

  const jsonLdBlocks = $('script[type="application/ld+json"]').toArray()
    .map((el) => $(el).html()?.trim())
    .filter(Boolean);

  return { urls, blocks, jsonLdBlocks };
}

/**
 * Extracts hero section data: logo, chart title, small heading, intro text.
 * @param {cheerio.CheerioAPI} $ - Cheerio instance
 * @returns {{logo: {src: string, alt: string, href: string}, chartTitle: string, smallHeading: string, introText: string}}
 */
export function extractHero($) {
  // Always use our own brand logo regardless of what the source site has
  const logo = {
    src: '/banner.png',
    alt: 'MATKAKING',
    href: '/',
  };

  // Extract chart title (h1 with class chart-h1)
  const chartTitle = normalizeText($('.chart-h1').first().text());

  // Extract small heading
  const smallHeading = normalizeText($('.small-heading').first().text());

  // Extract intro text (paragraph with class para3)
  const introText = normalizeText($('.para3').first().text());

  return { logo, chartTitle, smallHeading, introText };
}

/**
 * Extracts the result display section with market name, value, and refresh link.
 * @param {cheerio.CheerioAPI} $ - Cheerio instance
 * @param {'jodi' | 'panel'} type - Chart type
 * @param {string} slug - Market slug
 * @returns {{className: string, marketName: string, value: string, refreshLabel: string, refreshHref: string}}
 */
export function extractResult($, type, slug) {
  const resultEl = $('.chart-result').first();

  if (!resultEl.length) {
    return { className: '', marketName: '', value: '', refreshLabel: '', refreshHref: '' };
  }

  const className = resultEl.attr('class') || '';

  // Market name from element with data-live-result-name attribute or first div/span
  const nameEl = resultEl.find('[data-live-result-name]').first();
  const marketName = nameEl.length
    ? normalizeText(nameEl.text())
    : normalizeText(resultEl.find('div').first().text());

  // Value from element with data-live-result-value attribute or span
  const valueEl = resultEl.find('[data-live-result-value]').first();
  const value = valueEl.length
    ? normalizeText(valueEl.text())
    : normalizeText(resultEl.find('span').first().text());

  // Refresh link
  const refreshEl = resultEl.find('[data-refresh-button]').first();
  const refreshAnchor = refreshEl.length ? refreshEl : resultEl.find('a').first();

  const refreshLabel = refreshAnchor.length
    ? normalizeText(refreshAnchor.text()) || 'Refresh Result'
    : '';
  const refreshHref = refreshAnchor.length
    ? (refreshAnchor.attr('href') || '')
    : '';

  return { className, marketName, value, refreshLabel, refreshHref };
}

/**
 * Extracts chart table data: title, column headers, and data rows with cell details.
 * @param {cheerio.CheerioAPI} $ - Cheerio instance
 * @param {'jodi' | 'panel'} type - Chart type
 * @returns {{title: string, columns: string[], rows: Array, attrs: object, headingAttrs: object, titleAttrs: object}}
 */
export function extractChartTable($, type) {
  const tableEl = $('table.panel-chart, table.chart-table').first();

  if (!tableEl.length) {
    return { title: '', columns: [], rows: [], attrs: {}, headingAttrs: {}, titleAttrs: {} };
  }

  // Extract table attributes
  const attrs = extractElementAttrs($, tableEl[0]);

  // Extract column headers from first <tr> with <th> elements
  const headerRow = tableEl.find('tr').first();
  const columns = headerRow.find('th').toArray()
    .map((th) => extractCellText($, th));

  // Extract data rows (skip header row)
  const dataRows = tableEl.find('tr').toArray().slice(1);
  const rows = dataRows.map((tr, rowIndex) => {
    const cells = $(tr).find('td').toArray().map((td, cellIndex) => ({
      id: String(cellIndex),
      column: columns[cellIndex] || '',
      text: extractCellText($, td),
      isHighlight: $(td).hasClass('r') || false,
      className: $(td).attr('class') || '',
      attrs: extractElementAttrs($, td),
    }));

    return { id: String(rowIndex), rowIndex, cells };
  });

  // Extract table title from panel-heading above or inside the table's parent
  const panelHeading = tableEl.closest('.panel, .panel-info').find('.panel-heading').first();
  const prevHeading = tableEl.prev('.panel-heading');
  const headingEl = panelHeading.length ? panelHeading : prevHeading;

  const title = normalizeText(headingEl.text());
  const headingAttrs = headingEl.length ? extractElementAttrs($, headingEl[0]) : {};

  // Extract title attrs from h1 inside heading
  const titleH1 = headingEl.find('h1').first();
  const titleAttrs = titleH1.length ? extractElementAttrs($, titleH1[0]) : {};

  return { title, columns, rows, attrs, headingAttrs, titleAttrs };
}

/**
 * Extracts footer data: blocks, brand title, rights lines, counter number, and matka play link.
 * @param {cheerio.CheerioAPI} $ - Cheerio instance
 * @returns {{blocks: Array, brandTitle: string, rightsLines: string[], counterNumber: string, matkaPlay: {label: string, href: string}}}
 */
export function extractFooter($) {
  // Extract footer text blocks
  const footerTextDiv = $('.footer-text-div').first();
  const blocks = [];

  if (footerTextDiv.length) {
    // Remove the entire "dpboss Special Game Zone" section before extracting blocks.
    // This section contains promotional links (guessing forum, trick charts, etc.)
    // that we don't want on our site. It's typically a table or div with links to
    // dpboss subpages.
    footerTextDiv.find('table').each((_, table) => {
      const tableText = normalizeText($(table).text()).toLowerCase();
      if (
        tableText.includes('game zone') ||
        tableText.includes('guessing forum') ||
        tableText.includes('trick') ||
        tableText.includes('fix game') ||
        tableText.includes('expert forum')
      ) {
        $(table).remove();
      }
    });

    footerTextDiv.children().each((_, child) => {
      const el = $(child);
      const tag = child.tagName || child.name || '';
      if (tag === 'br') return;

      const text = normalizeText(el.text());
      if (!text) return;

      // Skip any remaining promotional/forum links from dpbossss.boston
      const lowerText = text.toLowerCase();
      if (
        lowerText.includes('game zone') ||
        lowerText.includes('guessing forum') ||
        lowerText.includes('expert forum') ||
        lowerText.includes('trick forum') ||
        lowerText.includes('special game') ||
        lowerText.includes('dpboss forum') ||
        lowerText.includes('free fix game') ||
        lowerText.includes('fix panel chart') ||
        lowerText.includes('final number trick') ||
        lowerText.includes('trick zone') ||
        lowerText.includes('matka tricks') ||
        lowerText.includes('ratan khatri') ||
        lowerText.includes('evergreen trick') ||
        lowerText.includes('all market free') ||
        lowerText.includes('fix game') ||
        lowerText.includes('trick chart')
      ) {
        return;
      }

      blocks.push({
        tag: String(tag || 'p'),
        className: el.attr('class') || '',
        text,
      });
    });
  }

  // Extract brand title from footer .ftr-icon
  const footerEl = $('footer').first();
  const brandTitle = normalizeText(footerEl.find('.ftr-icon').first().text());

  // Extract rights lines from footer paragraph
  const footerParagraph = footerEl.find('p').first();
  const rightsLines = footerParagraph.length
    ? String(footerParagraph.text() || '')
        .split(/\n+/)
        .map((line) => normalizeText(line))
        .filter(Boolean)
    : [];

  // Extract counter number — a small standalone numeric element that appears
  // between the "Go to Top" button and the footer brand block on dpbossss pages
  // (e.g. "132"). It is a per-page unique identifier that differs between
  // jodi and panel pages and across markets.
  let counterNumber = '';
  const counterCandidates = [
    '#counter',
    '.counter',
    '.market-counter',
    '.page-counter',
  ];
  for (const selector of counterCandidates) {
    const el = $(selector).first();
    if (el.length) {
      const text = normalizeText(el.text());
      if (/^\d+$/.test(text)) {
        counterNumber = text;
        break;
      }
    }
  }

  // Fallback: search the body for a small standalone numeric text node
  // sitting before the <footer> element. Look at <p>, <div>, <span>, <b>
  // elements containing only digits.
  if (!counterNumber) {
    const numericNodes = $('body p, body div, body span, body b, body strong')
      .toArray()
      .map((el) => ({ el, text: normalizeText($(el).text()) }))
      .filter(({ text }) => /^\d{1,10}$/.test(text));

    // Pick the last numeric node before the <footer> if any
    if (numericNodes.length > 0) {
      counterNumber = numericNodes[numericNodes.length - 1].text;
    }
  }

  // Extract matka play link
  const matkaPlayEl = $('.mp-btn').first();
  const matkaPlay = {
    label: matkaPlayEl.length ? normalizeText(matkaPlayEl.text()) : '',
    href: matkaPlayEl.length ? (matkaPlayEl.attr('href') || '') : '',
  };

  return { blocks, brandTitle, rightsLines, counterNumber, matkaPlay };
}

/**
 * Parses the custom HTML format used by main-bombay-36-bazar-chart.php
 * and hs-online-bb-15-minutes-chart.php (local static files).
 * These pages use .result-table/.result-grid/.result-cell or <table> with Time/Result columns.
 */
function parseLocalChartPage($, slug) {
  const title = normalizeText($('title').text()) || slug.replace(/-/g, ' ').toUpperCase();
  const h1 = normalizeText($('h1').first().text()) || title;

  // Try to extract table data — two formats:
  // Format 1: .result-table > .result-grid > .result-cell (main-bombay)
  // Format 2: .result-table > table with Time/Result columns (hs-online)
  const columns = ['Date', 'Time', 'Result'];
  const rows = [];
  let rowIndex = 0;

  $('.result-table').each((tableIndex, tableEl) => {
    const dateLabel = normalizeText($(tableEl).find('.result-date').first().text());

    // Format 1: grid cells
    const gridCells = $(tableEl).find('.result-cell').toArray();
    if (gridCells.length > 0) {
      const cells = gridCells.map((cell) => {
        const time = normalizeText($(cell).find('.time-label').text());
        const value = normalizeText($(cell).find('.game-value').text());
        return { time, value };
      });

      // Group into rows of 4
      for (let i = 0; i < cells.length; i += 4) {
        const rowCells = cells.slice(i, i + 4);
        rows.push({
          id: String(rowIndex),
          rowIndex,
          cells: [
            { id: '0', column: 'Date', text: i === 0 ? dateLabel : '', isHighlight: false, className: '', attrs: {} },
            ...rowCells.flatMap((c) => [
              { id: String(rowIndex) + 't', column: 'Time', text: c.time, isHighlight: false, className: '', attrs: {} },
              { id: String(rowIndex) + 'v', column: 'Result', text: c.value, isHighlight: false, className: '', attrs: {} },
            ]),
          ],
        });
        rowIndex++;
      }
      return;
    }

    // Format 2: <table> with Time/Result columns
    $(tableEl).find('tbody tr').each((_, tr) => {
      const tds = $(tr).find('td').toArray().map((td) => normalizeText($(td).text()));
      if (tds.length === 0) return;
      rows.push({
        id: String(rowIndex),
        rowIndex,
        cells: [
          { id: '0', column: 'Date', text: rowIndex === 0 ? dateLabel : '', isHighlight: false, className: '', attrs: {} },
          ...tds.map((text, i) => ({
            id: String(i + 1),
            column: i % 2 === 0 ? 'Time' : 'Result',
            text,
            isHighlight: false,
            className: '',
            attrs: {},
          })),
        ],
      });
      rowIndex++;
    });
  });

  return {
    version: 2,
    type: 'jodi',
    slug,
    title,
    description: `${h1} - Latest results and chart`,
    seo: { meta: [] },
    styles: { urls: [], blocks: [], jsonLdBlocks: [] },
    hero: {
      logo: { src: '/banner.png', alt: 'MATKAKING', href: '/' },
      chartTitle: h1,
      smallHeading: '',
      introText: '',
    },
    result: {
      className: 'chart-result',
      marketName: h1,
      value: 'Result Coming',
      refreshLabel: 'Refresh Result',
      refreshHref: `/${slug}.php`,
    },
    controls: {
      topAnchorId: 'market-top',
      bottomAnchorId: 'market-bottom',
      goBottomLabel: 'Go to Bottom',
      goTopLabel: 'Go to Top',
    },
    table: {
      title: h1,
      columns,
      rows,
      attrs: { class: 'panel-chart chart-table', style: 'width:100%;text-align:center;' },
      headingAttrs: { class: 'panel-heading text-center', style: 'background:#3f51b5;' },
      titleAttrs: {},
    },
    footer: { blocks: [], brandTitle: 'MATKAKING.CC', rightsLines: [], counterText: '', counterNumber: '', matkaPlay: { label: 'Matka Play', href: '/' } },
    importedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Scrapes a market page from dpbossss.boston and parses it with cheerio.
 *
 * @param {'jodi' | 'panel'} type - Chart type
 * @param {string} slug - Market slug (e.g., 'kalyan', 'milan-day')
 * @param {object} options
 * @param {number} options.timeoutMs - HTTP request timeout (default 15000)
 * @returns {Promise<{ $: cheerio.CheerioAPI, html: string, url: string }>} Parsed cheerio instance and metadata
 * @throws {Error} On network failure, empty response, or non-2xx status
 */
export async function scrapeMarketPage(type, slug, { timeoutMs = 15000 } = {}) {
  const baseUrl = getBaseUrl();
  const url = buildScrapeUrl(type, slug, baseUrl);
  const { httpAgent, httpsAgent } = getHttpAgents();

  const response = await axios.get(url, {
    timeout: timeoutMs,
    httpAgent,
    httpsAgent,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
  });

  const html = response.data;

  if (!html || typeof html !== 'string') {
    throw new Error(`Empty response from ${url}`);
  }

  const $ = cheerio.load(html, { decodeEntities: false });

  return { $, html, url };
}

/**
 * Scrapes a market page and parses it into a StructuredMarketContent object (version 2).
 * The output shape matches what `getFromMongo()` produces so the client renders identically
 * regardless of content source.
 *
 * @param {'jodi' | 'panel'} type - Chart type
 * @param {string} slug - Market slug (e.g., 'kalyan', 'milan-day')
 * @param {object} options
 * @param {number} options.timeoutMs - HTTP request timeout (default 15000)
 * @returns {Promise<object>} StructuredMarketContent object
 * @throws {Error} On network failure, empty response, or non-2xx status
 */
export async function scrapeAndParseMarketPage(type, slug, { timeoutMs = 15000 } = {}) {
  // Special pages: scrape from source and return raw HTML body for direct rendering
  if (LOCAL_STATIC_SLUGS.has(slug)) {
    const phpFile = LOCAL_STATIC_SLUGS.get(slug);
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}/${phpFile}`;
    const { httpAgent, httpsAgent } = getHttpAgents();
    const response = await axios.get(url, {
      timeout: timeoutMs,
      httpAgent,
      httpsAgent,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });
    const html = response.data;
    if (!html || typeof html !== 'string') {
      throw new Error(`Empty response from ${url}`);
    }
    const $ = cheerio.load(html, { decodeEntities: false });

    // Extract just the body content (skip the logo/header div .B1)
    const title = normalizeText($('title').text()) || slug.replace(/-/g, ' ').toUpperCase();
    const h1 = normalizeText($('h1').first().text()) || title;

    // Extract CSS links and style blocks from <head>
    const cssLinks = $('link[rel="stylesheet"]').toArray()
      .map((el) => $(el).attr('href'))
      .filter(Boolean)
      .map((href) => `<link rel="stylesheet" href="${href}">`)
      .join('\n');

    const styleBlocks = $('style').toArray()
      .map((el) => `<style>${$(el).html()}</style>`)
      .join('\n');

    // Get the container content (everything after the logo div)
    const bodyContent = $('body').clone();
    bodyContent.find('.B1').remove(); // remove source logo
    const bodyHtml = bodyContent.html() ?? '';

    // Combine styles + body for complete rendering
    const rawHtml = `${cssLinks}\n${styleBlocks}\n${bodyHtml}`;

    return {
      version: 2,
      type,
      slug,
      title,
      description: h1,
      rawHtml,
      seo: { meta: [] },
      styles: { urls: [], blocks: [], jsonLdBlocks: [] },
      hero: { logo: { src: '/banner.png', alt: 'MATKAKING', href: '/' }, chartTitle: h1, smallHeading: '', introText: '' },
      result: { className: 'chart-result', marketName: h1, value: 'Result Coming', refreshLabel: 'Refresh Result', refreshHref: `/${slug}.php` },
      controls: { topAnchorId: 'market-top', bottomAnchorId: 'market-bottom', goBottomLabel: 'Go to Bottom', goTopLabel: 'Go to Top' },
      table: { title: '', columns: [], rows: [], attrs: {}, headingAttrs: {}, titleAttrs: {} },
      footer: { blocks: [], brandTitle: 'MATKAKING.CC', rightsLines: [], counterText: '', counterNumber: '', matkaPlay: { label: 'Matka Play', href: '/' } },
      importedAt: null,
      updatedAt: new Date().toISOString(),
    };
  }

  const { $, url } = await scrapeMarketPage(type, slug, { timeoutMs });

  // Extract page title from <title> tag
  const title = normalizeText($('title').text());

  // Extract all structured sections
  const meta = extractMetaTags($);
  const styles = extractStyles($, url);
  const hero = extractHero($);
  const result = extractResult($, type, slug);
  const table = extractChartTable($, type);
  const footer = extractFooter($);

  // Derive description from meta description tag
  const descriptionMeta = meta.find((m) => m.name === 'description');
  const description = descriptionMeta ? descriptionMeta.content : '';

  // Assemble StructuredMarketContent (version 2)
  const content = {
    version: 2,
    type,
    slug,
    title,
    description,
    seo: {
      meta,
    },
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
    importedAt: null,
    updatedAt: new Date().toISOString(),
  };

  // Replace source site branding with our brand in all string values
  return rebrandContent(content);
}

/**
 * Recursively replaces source site branding (dpboss/dpbossss) with our brand
 * (MATKAKING/matkaking) in all string values of the content object.
 * NOTE: The regex patterns below must use the SOURCE site's brand name — do NOT
 * rename these patterns during branding updates.
 */
function rebrandContent(value) {
  if (typeof value === 'string') {
    return value
      .replace(/DPBOSSSS\.BOSTON/gi, 'MATKAKING.CC')
      .replace(/DPBOSS\.BOSTON/gi, 'MATKAKING.CC')
      .replace(/dpbossss\.boston/gi, 'matkaking.cc')
      .replace(/dpboss\.boston/gi, 'matkaking.cc')
      .replace(/DPBOSSSS/g, 'MATKAKING')
      .replace(/DPBOSS/g, 'MATKAKING')
      .replace(/Dpbossss/g, 'Matkaking')
      .replace(/Dpboss/g, 'Matkaking')
      .replace(/dpbossss/g, 'matkaking')
      .replace(/dpboss/g, 'matkaking');
  }

  if (Array.isArray(value)) {
    return value.map(rebrandContent);
  }

  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = rebrandContent(val);
    }
    return result;
  }

  return value;
}
