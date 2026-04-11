import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { getHttpAgents } from '../config/http-agents.js';
import { AppError } from '../utils/errors.js';
import { normalizeMarketSlug, toLocalMarketPath } from '../utils/market-links.js';

const TYPE_CONFIG = {
  jodi: {
    folder: 'jodi',
    pattern: /^\d+-jodi-dpboss\.boston-jodi-chart-record-(.+)\.php$/i,
    sourcePath: 'jodi-chart-record',
  },
  panel: {
    folder: 'panel',
    pattern: /^\d+-panel-dpboss\.boston-panel-chart-record-(.+)\.php$/i,
    sourcePath: 'panel-chart-record',
  },
};

const MAX_LIMIT = 400;
const DEFAULT_LIMIT = 180;
const DEFAULT_TABLE_CACHE_TTL_MS = 45_000;
const DEFAULT_TABLE_FETCH_TIMEOUT_MS = 8_000;
const DEFAULT_TABLE_FETCH_CONCURRENCY = 2;
const MARKET_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function normalizeMalformedEmbeddedImageUrl(value = '') {
  return String(value).replace(
    /\bjs\/image\/(png|jpeg|jpg|gif|webp);base64,([a-z0-9+/=_-]+)\.js\b/i,
    (_match, format, payload) => `data:image/${String(format).toLowerCase()};base64,${payload}`,
  );
}

function sanitizeText(value = '') {
  return String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeAssetPath(value = '') {
  return String(value)
    .trim()
    .replace(/^\.?\//, '')
    .replace(/^\/+/, '')
    .replace(/\.\.(\/|\\)/g, '')
    .replace(/\\/g, '/');
}

function encodePathSegments(assetPath = '') {
  return assetPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function toStaticAssetUrl(type, slug, value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  const normalizedDataUrl = normalizeMalformedEmbeddedImageUrl(raw);
  if (/^data:image\//i.test(normalizedDataUrl)) {
    return normalizedDataUrl;
  }

  if (/^(https?:|mailto:|tel:|#)/i.test(raw)) {
    return raw;
  }

  if (raw.startsWith('//')) {
    return '';
  }

  const assetPath = normalizeAssetPath(raw);
  if (!assetPath) {
    return '';
  }

  return `/api/market-page/${type}/${slug}/static/${encodePathSegments(assetPath)}`;
}

function sanitizeLinkHref(type, slug, value = '') {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  if (/^javascript:/i.test(raw) || /^data:/i.test(raw) || /^vbscript:/i.test(raw)) {
    return '';
  }

  const localMarketHref = toLocalMarketPath(raw);
  if (localMarketHref) {
    return localMarketHref;
  }

  const plainPhpMatch = raw
    .toLowerCase()
    .replace(/^\/+/, '')
    .match(/^([a-z0-9-]+)\.php(?:[?#].*)?$/i);
  if (plainPhpMatch) {
    const nextSlug = normalizeMarketSlug(plainPhpMatch[1]);
    if (nextSlug) {
      return `/market/${type}/${nextSlug}`;
    }
  }

  if (/^(https?:|mailto:|tel:|#)/i.test(raw)) {
    return raw;
  }

  if (/^[a-z0-9+.-]+:/i.test(raw)) {
    return '';
  }

  return toStaticAssetUrl(type, slug, raw);
}

function sanitizeCss(type, slug, cssText = '') {
  if (!cssText) {
    return '';
  }

  return String(cssText)
    .replace(/@import\s+url\(([^)]+)\)\s*;?/gi, (_match, rawImport) => {
      const value = String(rawImport).trim().replace(/^['"]|['"]$/g, '');
      const sanitized = sanitizeLinkHref(type, slug, value);
      if (!sanitized) {
        return '';
      }
      return `@import url("${sanitized}");`;
    })
    .replace(/url\(([^)]+)\)/gi, (_match, rawUrl) => {
      const value = String(rawUrl).trim().replace(/^['"]|['"]$/g, '');
      const sanitized =
        value.startsWith('data:') || value.startsWith('#')
          ? value
          : toStaticAssetUrl(type, slug, value);
      if (!sanitized) {
        return 'url("")';
      }
      return `url("${sanitized}")`;
    });
}

function isAmpBoilerplateCss(cssText = '') {
  const normalized = String(cssText).toLowerCase();
  return (
    normalized.includes('-amp-start') &&
    normalized.includes('visibility:hidden') &&
    normalized.includes('keyframes')
  );
}

function sanitizeHtmlBlock(type, slug, html = '') {
  const $ = cheerio.load(`<div id="__root__">${html}</div>`, { decodeEntities: false });
  const $root = $('#__root__');

  $root.find('script, iframe').remove();
  $root.find('*').each((_, node) => {
    const attributes = node.attribs ?? {};
    for (const attributeName of Object.keys(attributes)) {
      if (/^on/i.test(attributeName)) {
        delete attributes[attributeName];
      }
    }
  });

  $root.find('a[href]').each((_, anchor) => {
    const href = sanitizeLinkHref(type, slug, anchor.attribs?.href ?? '');
    if (href) {
      anchor.attribs.href = href;
    } else {
      delete anchor.attribs.href;
    }
  });

  $root.find('a,button,input[type="button"],input[type="submit"]').each((_, element) => {
    const tagName = String(element.tagName ?? '').toLowerCase();
    const label = sanitizeText(
      tagName === 'input'
        ? String(element.attribs?.value ?? '')
        : $(element).text(),
    ).toLowerCase();

    if (!label) {
      return;
    }

    if (label.includes('refresh')) {
      element.attribs = element.attribs ?? {};
      element.attribs['data-refresh-button'] = 'true';
      if (tagName === 'a' && !element.attribs.href) {
        element.attribs.href = '#';
      }
    }

    if (label.includes('go to top')) {
      element.attribs = element.attribs ?? {};
      if (tagName === 'a') {
        element.attribs.href = '#market-top';
      } else {
        element.attribs['data-market-scroll'] = 'top';
      }
    }

    if (label.includes('go to bottom')) {
      element.attribs = element.attribs ?? {};
      if (tagName === 'a') {
        element.attribs.href = '#market-bottom';
      } else {
        element.attribs['data-market-scroll'] = 'bottom';
      }
    }
  });

  $root.find('[src]').each((_, element) => {
    const src = toStaticAssetUrl(type, slug, element.attribs?.src ?? '');
    if (src) {
      element.attribs.src = src;
    } else {
      delete element.attribs.src;
    }
  });

  normalizeSimpleWeekTables($, $root);

  return $root.html() ?? '';
}

function getSpanSize(node, attributeName) {
  const raw = String(node.attribs?.[attributeName] ?? '').trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getRenderedColumnCount($, rowNode) {
  return $(rowNode)
    .children('td,th')
    .toArray()
    .reduce((total, cellNode) => total + getSpanSize(cellNode, 'colspan'), 0);
}

function isWeekHeaderRow($, rowNode) {
  const values = $(rowNode)
    .children('th,td')
    .toArray()
    .map((cellNode) => sanitizeText($(cellNode).text()).toLowerCase());

  if (values.length < 7) {
    return false;
  }

  const hasMon = values.some((value) => value === 'mon' || value === 'monday' || value === 'mo');
  const hasSun = values.some((value) => value === 'sun' || value === 'sunday');
  return hasMon && hasSun;
}

function normalizeSimpleWeekTables($, $root) {
  $root.find('table').each((_, tableNode) => {
    const rows = $(tableNode).find('tr').toArray();
    if (rows.length < 2) {
      return;
    }

    const headerRow = rows[0];
    if (!isWeekHeaderRow($, headerRow)) {
      return;
    }

    const headerCells = $(headerRow).children('th,td').toArray();
    if (headerCells.length !== 7) {
      return;
    }

    const hasHeaderSpans = headerCells.some((cellNode) => {
      const colspan = Number.parseInt(String(cellNode.attribs?.colspan ?? '1'), 10);
      const rowspan = Number.parseInt(String(cellNode.attribs?.rowspan ?? '1'), 10);
      return (Number.isFinite(colspan) && colspan > 1) || (Number.isFinite(rowspan) && rowspan > 1);
    });
    if (hasHeaderSpans) {
      return;
    }

    const expectedColumns = getRenderedColumnCount($, headerRow);
    if (expectedColumns !== 7) {
      return;
    }

    const dataRows = rows.slice(1).filter((rowNode) => $(rowNode).children('td,th').length > 0);
    const simpleDataRows = dataRows.filter((rowNode) => {
      const cells = $(rowNode).children('td,th').toArray();
      return cells.every((cellNode) => {
        const colspan = Number.parseInt(String(cellNode.attribs?.colspan ?? '1'), 10);
        const rowspan = Number.parseInt(String(cellNode.attribs?.rowspan ?? '1'), 10);
        return (!Number.isFinite(colspan) || colspan <= 1) && (!Number.isFinite(rowspan) || rowspan <= 1);
      });
    });
    if (simpleDataRows.length === 0) {
      return;
    }

    const maxColumns = simpleDataRows.reduce(
      (maximum, rowNode) => Math.max(maximum, getRenderedColumnCount($, rowNode)),
      0,
    );
    if (maxColumns >= expectedColumns || maxColumns < 5) {
      return;
    }

    const headerCellsSelection = $(headerRow).children('th,td');
    while (headerCellsSelection.length > maxColumns) {
      headerCellsSelection.last().remove();
    }
  });
}

function pickPrimaryTable($) {
  const tables = $('table').toArray();
  if (tables.length === 0) {
    return null;
  }

  let bestTable = null;
  let bestScore = -1;

  for (const table of tables) {
    const tableNode = $(table);
    const rows = tableNode.find('tbody tr').length || tableNode.find('tr').length;
    const cells = tableNode.find('td,th').length;
    const score = rows * 100 + cells;
    if (score > bestScore) {
      bestScore = score;
      bestTable = table;
    }
  }

  return bestTable;
}

function parseTableSnapshot($, table) {
  const tableNode = $(table);
  let headerCells = tableNode
    .find('thead th')
    .toArray()
    .map((cell) => sanitizeText($(cell).text()))
    .filter(Boolean);

  let bodyRows = tableNode.find('tbody tr').toArray();
  if (bodyRows.length === 0) {
    const allRows = tableNode.find('tr').toArray();
    if (headerCells.length === 0 && allRows.length > 0) {
      const firstRowHeader = $(allRows[0])
        .children('th,td')
        .toArray()
        .map((cell) => sanitizeText($(cell).text()))
        .filter(Boolean);
      const hasWeekHeader =
        firstRowHeader.some((value) => /^mo(n(day)?)?$/i.test(value)) &&
        firstRowHeader.some((value) => /^sun(day)?$/i.test(value));
      if (hasWeekHeader || firstRowHeader.every((value) => /^[a-z]{2,12}$/i.test(value))) {
        headerCells = firstRowHeader;
        bodyRows = allRows.slice(1);
      } else {
        bodyRows = allRows;
      }
    } else {
      bodyRows = allRows.slice(headerCells.length > 0 ? 1 : 0);
    }
  }

  const normalizedRows = bodyRows
    .map((row, rowIndex) => {
      const cells = $(row)
        .find('td,th')
        .toArray()
        .map((cell, cellIndex) => {
          const text = sanitizeText($(cell).text());
          return {
            id: `${rowIndex}-${cellIndex}`,
            text,
            isHighlight: /\b(r|red|chart-|chat-|css-)\b/i.test(String(cell.attribs?.class ?? '')),
          };
        })
        .filter((cell) => cell.text.length > 0);

      return {
        id: String(rowIndex),
        cells,
      };
    })
    .filter((row) => row.cells.length > 0);

  return {
    heading:
      sanitizeText(
        tableNode
          .closest('.panel')
          .find('.panel-heading h3, .panel-heading h1')
          .first()
          .text(),
      ) || sanitizeText(tableNode.prevAll('h3,h2').first().text()),
    columns: headerCells,
    rows: normalizedRows,
  };
}

function paginateTableSnapshot(snapshot, { offset = 0, limit = DEFAULT_LIMIT } = {}) {
  if (!snapshot) {
    return null;
  }

  const safeOffset = Math.max(0, Number.parseInt(String(offset ?? 0), 10) || 0);
  const parsedLimit = Number.parseInt(String(limit ?? DEFAULT_LIMIT), 10);
  const safeLimit = Number.isFinite(parsedLimit)
    ? Math.min(MAX_LIMIT, Math.max(20, parsedLimit))
    : DEFAULT_LIMIT;

  const rows = snapshot.rows.slice(safeOffset, safeOffset + safeLimit);
  const totalRows = snapshot.rows.length;

  return {
    heading: snapshot.heading,
    columns: snapshot.columns,
    rows,
    totalRows,
    offset: safeOffset,
    limit: safeLimit,
    hasMore: safeOffset + rows.length < totalRows,
  };
}

function parseTableRows($, table, options = {}) {
  return paginateTableSnapshot(parseTableSnapshot($, table), options);
}

function parseChartLinks($, type, slug) {
  return $('.chart-list a[href]')
    .toArray()
    .map((anchor) => {
      const href = String(anchor.attribs?.href ?? '').trim();
      const localHref = toLocalMarketPath(href);
      return {
        label: sanitizeText($(anchor).text()),
        href: localHref || sanitizeLinkHref(type, slug, href),
      };
    })
    .filter((item) => item.label && item.href);
}

function extractTableHtmlBlocks($, type, slug) {
  const seen = new Set();
  const blocks = [];

  $('.panel.panel-info')
    .toArray()
    .forEach((panelNode) => {
      if ($(panelNode).find('table').length === 0) {
        return;
      }

      const html = sanitizeHtmlBlock(type, slug, $.html(panelNode));
      const normalized = String(html).trim();
      if (!normalized || seen.has(normalized)) {
        return;
      }
      seen.add(normalized);
      blocks.push(normalized);
    });

  if (blocks.length > 0) {
    return blocks;
  }

  $('table').each((_, tableNode) => {
    const html = sanitizeHtmlBlock(type, slug, $.html(tableNode));
    const normalized = String(html).trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    blocks.push(normalized);
  });

  return blocks;
}

function getControlText($, node) {
  const tagName = String(node.tagName ?? '').toLowerCase();
  if (tagName === 'input') {
    return sanitizeText($(node).attr('value') ?? '');
  }
  return sanitizeText($(node).text() ?? '');
}

function extractHeroHtmlBlocks($, type, slug) {
  const seen = new Set();
  const blocks = [];
  let hasGoBottomControl = false;

  const chartResultNode = $('.chart-result').first().get(0);
  if (chartResultNode) {
    const chartHtml = sanitizeHtmlBlock(type, slug, $.html(chartResultNode));
    const normalized = String(chartHtml).trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      blocks.push(normalized);
    }
  }

  $('a,button,input[type="button"],input[type="submit"]').each((_, node) => {
    const text = getControlText($, node).toLowerCase();
    if (!text.includes('go to bottom')) {
      return;
    }
    hasGoBottomControl = true;

    const html = sanitizeHtmlBlock(type, slug, $.html(node));
    const normalized = String(html).trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    blocks.push(normalized);
  });

  if (!hasGoBottomControl && blocks.length > 0) {
    blocks.push('<button type="button" data-market-scroll="bottom">Go to Bottom</button>');
  }

  return blocks;
}

function extractFooterHtmlBlocks($, type, slug) {
  const seen = new Set();
  const blocks = [];
  const $container = $('body').first().length > 0 ? $('body').first() : $.root();

  $container.children().each((_, node) => {
    const $node = $(node);
    const tagName = String(node.tagName ?? '').toLowerCase();
    const classList = String($node.attr('class') ?? '').toLowerCase();
    const textContent = sanitizeText($node.text() ?? '');

    const isFooterText = classList.split(/\s+/).includes('footer-text-div');
    const isCenterGoControl = tagName === 'center' && /go to top/i.test(textContent);
    const isCounterValue = tagName === 'p' && /^\d+$/.test(textContent);
    const isFooterBlock = tagName === 'footer';
    const isMatkaPlayButton = tagName === 'a' && classList.split(/\s+/).includes('mp-btn');

    if (
      !(
        isFooterText ||
        isCenterGoControl ||
        isCounterValue ||
        isFooterBlock ||
        isMatkaPlayButton
      )
    ) {
      return;
    }

    const html = sanitizeHtmlBlock(type, slug, $.html(node));
    const normalized = String(html).trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    blocks.push(normalized);
  });

  return blocks;
}

function extractStyleBlocks($, type, slug) {
  return $('style')
    .toArray()
    .map((styleNode) => $(styleNode).html() ?? '')
    .filter((rawCss) => !isAmpBoilerplateCss(rawCss))
    .map((rawCss) => sanitizeCss(type, slug, rawCss))
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function extractStyleUrls($, type, slug) {
  return $('link[rel="stylesheet"][href]')
    .toArray()
    .map((link) => toStaticAssetUrl(type, slug, link.attribs?.href ?? ''))
    .filter(Boolean);
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildSourceMarketUrl(type, slug, targetUrl) {
  const typeConfig = TYPE_CONFIG[type];
  if (!typeConfig) {
    return '';
  }

  try {
    const resolved = new URL(targetUrl);
    resolved.pathname = `/${typeConfig.sourcePath}/${encodeURIComponent(slug)}.php`;
    resolved.search = '';
    resolved.hash = '';
    return resolved.toString();
  } catch {
    return '';
  }
}

function parseLiveTablePayload(type, slug, html, options = {}) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const table = pickPrimaryTable($);
  if (!table) {
    return null;
  }

  const tableSnapshot = parseTableSnapshot($, table);
  if (!tableSnapshot || tableSnapshot.rows.length === 0) {
    return null;
  }

  return {
    tableSnapshot,
    tableHtmlBlocks: extractTableHtmlBlocks($, type, slug),
    table: paginateTableSnapshot(tableSnapshot, options),
  };
}

function buildRegistry(webzipRoot, logger) {
  const byType = {
    jodi: new Map(),
    panel: new Map(),
  };

  for (const [type, config] of Object.entries(TYPE_CONFIG)) {
    const typePath = path.join(webzipRoot, config.folder);
    if (!fs.existsSync(typePath)) {
      logger?.warn?.('market_template_type_missing', { type, path: typePath });
      continue;
    }

    const directories = fs
      .readdirSync(typePath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

    for (const directory of directories) {
      const match = directory.name.match(config.pattern);
      if (!match) {
        continue;
      }

      const slug = normalizeMarketSlug(match[1]);
      if (!slug || byType[type].has(slug)) {
        continue;
      }

      const fullPath = path.join(typePath, directory.name);
      const indexPath = path.join(fullPath, 'index.html');
      if (!fs.existsSync(indexPath)) {
        continue;
      }

      byType[type].set(slug, {
        folderPath: fullPath,
        indexPath,
      });
    }
  }

  logger?.info?.('market_template_registry_loaded', {
    jodiCount: byType.jodi.size,
    panelCount: byType.panel.size,
  });

  return byType;
}

export function createMarketTemplateService({
  webzipRoot,
  logger,
  targetUrl = 'https://dpboss.boston/',
  liveFallbackEnabled = true,
  tableCacheTtlMs = DEFAULT_TABLE_CACHE_TTL_MS,
  tableFetchTimeoutMs = DEFAULT_TABLE_FETCH_TIMEOUT_MS,
  tableFetchConcurrency = DEFAULT_TABLE_FETCH_CONCURRENCY,
}) {
  const registry = buildRegistry(webzipRoot, logger);
  const pageCache = new Map();
  const liveTableCache = new Map();
  const liveTableInFlight = new Map();
  const { httpAgent, httpsAgent } = getHttpAgents();

  const useLiveFallback = Boolean(liveFallbackEnabled);
  const safeTableCacheTtlMs = toPositiveInt(tableCacheTtlMs, DEFAULT_TABLE_CACHE_TTL_MS);
  const safeTableFetchTimeoutMs = toPositiveInt(tableFetchTimeoutMs, DEFAULT_TABLE_FETCH_TIMEOUT_MS);
  const safeTableFetchConcurrency = Math.max(
    1,
    toPositiveInt(tableFetchConcurrency, DEFAULT_TABLE_FETCH_CONCURRENCY),
  );

  let activeLiveFetches = 0;
  const liveFetchWaiters = [];

  function parseMarketDocument(
    type,
    slug,
    html,
    { offset = 0, limit = DEFAULT_LIMIT, tableOverride = null } = {},
  ) {
    const $ = cheerio.load(html, { decodeEntities: false });
    const table = pickPrimaryTable($);

    const logoRaw = String($('.logo img').first().attr('src') ?? '').trim();
    const faviconRaw = String($('link[rel="shortcut icon"]').first().attr('href') ?? '').trim();
    const localTableSnapshot = table ? parseTableSnapshot($, table) : null;

    return {
      type,
      slug,
      title: sanitizeText($('title').first().text()),
      description: sanitizeText($('meta[name="description"]').attr('content') ?? ''),
      heading: sanitizeText($('.chart-h1').first().text() || $('h1').first().text()),
      summary: {
        title: sanitizeText($('.para3 h2').first().text()),
        description: sanitizeText($('.para3 p').first().text()),
      },
      logoUrl: toStaticAssetUrl(type, slug, logoRaw),
      faviconUrl: toStaticAssetUrl(type, slug, faviconRaw),
      result: {
        name: sanitizeText($('.chart-result div').first().text()),
        value: sanitizeText($('.chart-result span').first().text()),
      },
      actions: {
        goBottomLabel: 'Go to Bottom',
        goTopLabel: 'Go to Top',
      },
      links: parseChartLinks($, type, slug),
      styleBlocks: extractStyleBlocks($, type, slug),
      styleUrls: extractStyleUrls($, type, slug),
      heroHtmlBlocks: extractHeroHtmlBlocks($, type, slug),
      tableHtmlBlocks:
        Array.isArray(tableOverride?.tableHtmlBlocks) && tableOverride.tableHtmlBlocks.length > 0
          ? tableOverride.tableHtmlBlocks
          : extractTableHtmlBlocks($, type, slug),
      footerHtmlBlocks: extractFooterHtmlBlocks($, type, slug),
      table:
        tableOverride?.table ??
        (localTableSnapshot ? paginateTableSnapshot(localTableSnapshot, { offset, limit }) : null),
    };
  }

  function getCachedRecord(type, slug) {
    const entry = registry[type]?.get(slug);
    if (!entry) {
      return null;
    }

    const stats = fs.statSync(entry.indexPath);
    const cacheKey = `${type}:${slug}`;
    const cached = pageCache.get(cacheKey);
    if (cached && cached.mtimeMs === stats.mtimeMs) {
      return {
        html: cached.html,
      };
    }

    const html = fs.readFileSync(entry.indexPath, 'utf8');
    pageCache.set(cacheKey, {
      html,
      mtimeMs: stats.mtimeMs,
    });
    return {
      html,
    };
  }

  function toTableOverridePayload(cacheValue, options = {}) {
    if (!cacheValue?.tableSnapshot) {
      return null;
    }

    return {
      tableHtmlBlocks: cacheValue.tableHtmlBlocks,
      table: paginateTableSnapshot(cacheValue.tableSnapshot, options),
    };
  }

  async function withLiveFetchSlot(task) {
    if (activeLiveFetches >= safeTableFetchConcurrency) {
      await new Promise((resolve) => {
        liveFetchWaiters.push(resolve);
      });
    }

    activeLiveFetches += 1;
    try {
      return await task();
    } finally {
      activeLiveFetches = Math.max(0, activeLiveFetches - 1);
      const next = liveFetchWaiters.shift();
      if (next) {
        next();
      }
    }
  }

  function refreshLiveTableCache(cacheKey, type, slug, sourceUrl) {
    if (liveTableInFlight.has(cacheKey)) {
      return liveTableInFlight.get(cacheKey);
    }

    const inFlightRequest = withLiveFetchSlot(async () => {
      try {
        const response = await axios.get(sourceUrl, {
          timeout: safeTableFetchTimeoutMs,
          httpAgent,
          httpsAgent,
          headers: {
            'User-Agent': MARKET_USER_AGENT,
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        });

        const parsed = parseLiveTablePayload(type, slug, response.data, {
          offset: 0,
          limit: DEFAULT_LIMIT,
        });
        if (!parsed?.tableSnapshot || parsed.tableSnapshot.rows.length === 0) {
          return null;
        }

        const value = {
          tableSnapshot: parsed.tableSnapshot,
          tableHtmlBlocks: parsed.tableHtmlBlocks,
          fetchedAtMs: Date.now(),
          sourceUrl,
        };
        liveTableCache.set(cacheKey, {
          value,
          expiresAt: Date.now() + safeTableCacheTtlMs,
        });

        logger?.info?.('market_live_table_refreshed', {
          type,
          slug,
          sourceUrl,
          totalRows: value.tableSnapshot.rows.length,
          cacheTtlMs: safeTableCacheTtlMs,
        });

        return value;
      } catch (error) {
        logger?.warn?.('market_live_table_fetch_failed', {
          type,
          slug,
          sourceUrl,
          message: error.message,
        });
        return null;
      }
    })
      .finally(() => {
        liveTableInFlight.delete(cacheKey);
      });

    liveTableInFlight.set(cacheKey, inFlightRequest);
    return inFlightRequest;
  }

  async function loadLiveTable(type, slug, options = {}) {
    if (!useLiveFallback) {
      return null;
    }

    const requestOffset = Math.max(0, Number.parseInt(String(options.offset ?? 0), 10) || 0);
    if (requestOffset > 0) {
      return null;
    }

    const sourceUrl = buildSourceMarketUrl(type, slug, targetUrl);
    if (!sourceUrl) {
      return null;
    }

    const cacheKey = `${type}:${slug}`;
    const now = Date.now();
    const cachedEntry = liveTableCache.get(cacheKey);
    const hasFreshCache = Boolean(cachedEntry && cachedEntry.expiresAt > now);

    if (!hasFreshCache) {
      void refreshLiveTableCache(cacheKey, type, slug, sourceUrl);
    }

    if (cachedEntry?.value) {
      return toTableOverridePayload(cachedEntry.value, options);
    }

    return null;
  }

  return {
    async getTemplate(type, slug, options = {}) {
      const normalizedType = type === 'panel' ? 'panel' : 'jodi';
      const normalizedSlug = normalizeMarketSlug(slug);
      if (!normalizedSlug) {
        throw new AppError('Invalid market slug', {
          statusCode: 400,
          code: 'INVALID_MARKET_SLUG',
        });
      }

      const cachedRecord = getCachedRecord(normalizedType, normalizedSlug);
      if (!cachedRecord) {
        throw new AppError('Market page not found', {
          statusCode: 404,
          code: 'MARKET_PAGE_NOT_FOUND',
          details: {
            type: normalizedType,
            slug: normalizedSlug,
          },
        });
      }

      const tableOverride = await loadLiveTable(normalizedType, normalizedSlug, options);
      return parseMarketDocument(normalizedType, normalizedSlug, cachedRecord.html, {
        ...options,
        tableOverride,
      });
    },
  };
}
