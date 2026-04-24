import { AppError } from '../../utils/errors.js';
import { normalizeMarketSlug } from '../../utils/market-links.js';
import { MarketContentMarketModel } from '../../models/market-content-market-model.js';
import { MarketChartRowModel } from '../../models/market-chart-row-model.js';
import { MarketMetaModel } from '../../models/market-meta-model.js';
import { toStructuredMarketContent } from './market-content-transform.js';

const JODI_COLUMNS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PROTECTED_CHART_SOURCES = new Set(['admin-result', 'manual']);

function normalizeType(value = '') {
  return String(value).toLowerCase() === 'panel' ? 'panel' : 'jodi';
}

function normalizeText(value = '') {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTodayUtcDateForCharts() {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );

    return new Date(Date.UTC(
      Number.parseInt(values.year, 10),
      Number.parseInt(values.month, 10) - 1,
      Number.parseInt(values.day, 10),
    ));
  } catch {
    const today = new Date();
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  }
}

function parseChartDate(value = '') {
  const matched = normalizeText(value).match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (!matched) {
    return null;
  }

  const [, day, month, year] = matched;
  const parsed = new Date(Date.UTC(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10) - 1,
    Number.parseInt(day, 10),
  ));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isProtectedChartCell(cell = {}) {
  const source = normalizeText(cell?.attrs?.['data-source']);
  return PROTECTED_CHART_SOURCES.has(source);
}

function blankCell(cell = {}) {
  return {
    ...cell,
    text: '',
    isHighlight: false,
    className: '',
    attrs: {},
  };
}

function blankAdminTodayAndFuturePanelRows(rows = []) {
  const todayUtc = getTodayUtcDateForCharts();

  return rows.map((row) => {
    const cells = Array.isArray(row?.cells) ? row.cells : [];
    const weekStart = parseChartDate(cells[0]?.text);
    if (!weekStart) {
      return row;
    }

    const nextCells = cells.map((cell) => ({ ...cell }));
    for (let dayIndex = 0; dayIndex < JODI_COLUMNS.length; dayIndex += 1) {
      const dayDate = new Date(weekStart.getTime());
      dayDate.setUTCDate(dayDate.getUTCDate() + dayIndex);
      if (dayDate.getTime() < todayUtc.getTime()) {
        continue;
      }

      const baseIndex = 1 + dayIndex * 3;
      for (let offset = 0; offset < 3; offset += 1) {
        const cellIndex = baseIndex + offset;
        if (nextCells[cellIndex] && !isProtectedChartCell(nextCells[cellIndex])) {
          nextCells[cellIndex] = blankCell(nextCells[cellIndex]);
        }
      }
    }

    return {
      ...row,
      cells: nextCells,
    };
  });
}

function toPageTypeLabel(type = '') {
  return normalizeType(type) === 'panel' ? 'Panel' : 'Jodi';
}

function buildAdminIntroText(marketName = '', type = '') {
  const pageTypeLabel = toPageTypeLabel(type);
  return [
    `Dpboss ${marketName} ${pageTypeLabel.toLowerCase()} chart, ${marketName} ${pageTypeLabel.toLowerCase()} chart, old ${marketName} ${pageTypeLabel.toLowerCase()} chart,`,
    `${marketName} ${pageTypeLabel.toLowerCase()} record, ${marketName} ${pageTypeLabel.toLowerCase()} chart 2012 to 2023,`,
    `${marketName} final ank, ${marketName} ${pageTypeLabel.toLowerCase()} chart matka, ${marketName} matka chart,`,
    `${marketName} chart result, डीपी बॉस, सट्टा चार्ट, सट्टा मटका ${pageTypeLabel === 'Panel' ? 'पैनल' : 'जोड़ी'} चार्ट`,
  ].join(' ');
}

function buildAdminFooterBlocks(marketName = '', type = '') {
  const pageTypeLabel = toPageTypeLabel(type);
  const recordLabel = `${marketName} ${pageTypeLabel} Chart Records`;

  return [
    {
      tag: 'p',
      className: '',
      text: `Welcome to DPBoss Services, your ultimate destination for comprehensive ${recordLabel}. In the realm of matka gambling, where precision is paramount, DPBoss Services stands as a reliable source committed to providing accurate data, enhancing your matka gaming experience.`,
    },
    {
      tag: 'h3',
      className: 'faq-heading',
      text: `Chart Your Path to Success:${recordLabel}:`,
    },
    {
      tag: 'p',
      className: '',
      text: `Explore the nuances of the ${marketName} market with our meticulously crafted ${pageTypeLabel} Chart Records. Our charts provide valuable insights into market trends, empowering you to make well informed decisions in the dynamic matka landscape.`,
    },
    {
      tag: 'h3',
      className: 'faq-heading',
      text: `Frequently Asked Questions (FAQ) for ${recordLabel}:`,
    },
    {
      tag: 'p',
      className: 'faq-title',
      text: `Q1: How frequently are the ${recordLabel} updated?`,
    },
    {
      tag: 'p',
      className: '',
      text: `The ${recordLabel} are updated regularly to provide access to the latest trends and patterns.`,
    },
    {
      tag: 'p',
      className: 'faq-title',
      text: `Q2: Is the interface user-friendly for navigating the ${recordLabel}?`,
    },
    {
      tag: 'p',
      className: '',
      text: `Absolutely. The interface is designed to be intuitive and easy to navigate for experienced players and newcomers.`,
    },
  ];
}

function buildAdminFooter(marketName = '', type = '', fallbackFooter = {}) {
  return {
    ...fallbackFooter,
    blocks: buildAdminFooterBlocks(marketName, type),
    brandTitle: 'DPBOSS.BOSTON',
    rightsLines: ['All Rights Reserved', '(1998-2024)', 'Contact (Astrologer-Dpboss)'],
    matkaPlay: {
      label: 'Matka Play',
      href: '/',
    },
  };
}

function normalizeMode(value = '') {
  return String(value).toLowerCase() === 'legacy' ? 'legacy' : 'mongo';
}

function isRecoverableMongoError(error) {
  if (!error) {
    return false;
  }

  if (error instanceof AppError) {
    if (
      [
        'MARKET_CONTENT_DB_UNAVAILABLE',
        'MARKET_CONTENT_NOT_READY',
        'MARKET_PAGE_NOT_FOUND',
      ].includes(error.code)
    ) {
      return true;
    }

    return Number(error.statusCode) >= 500;
  }

  const message = String(error.message ?? '').toLowerCase();
  return (
    message.includes('mongodb') ||
    message.includes('mongo') ||
    message.includes('database') ||
    message.includes('timed out') ||
    message.includes('server selection')
  );
}

function clonePayload(value) {
  return value;
}

function sanitizeColumns(columns = []) {
  return Array.isArray(columns)
    ? columns.map((column) => String(column ?? '').trim()).filter(Boolean)
    : [];
}

function sanitizeRows(rows = [], columns = []) {
  const rowWidth = Math.max(
    columns.length,
    ...rows.map((row) => (Array.isArray(row?.cells) ? row.cells.length : 0)),
  );

  return rows.map((row, rowIndex) => {
    const sourceCells = Array.isArray(row?.cells) ? row.cells : [];
    const cells = Array.from({ length: rowWidth }, (_, columnIndex) => {
      const column = columns[columnIndex] ?? '';
      const sourceCell = sourceCells[columnIndex] ?? {};
      return {
        id: String(columnIndex),
        column,
        text: String(sourceCell.text ?? '').trim(),
        isHighlight: Boolean(sourceCell.isHighlight),
        className: String(sourceCell.className ?? '').trim(),
        attrs: sourceCell.attrs && typeof sourceCell.attrs === 'object' ? { ...sourceCell.attrs } : {},
      };
    });

    return {
      id: String(row?.id ?? rowIndex),
      rowIndex,
      cells,
    };
  });
}

function toJodiRowsFromPanelRows(panelRows = []) {
  return panelRows
    .map((row, rowIndex) => {
      const sourceCells = Array.isArray(row?.cells) ? row.cells : [];
      if (sourceCells.length < 4) {
        return null;
      }

      const cells = [];

      for (let cellIndex = 2; cellIndex < sourceCells.length; cellIndex += 3) {
        const middleCell = sourceCells[cellIndex] ?? {};
        cells.push({
          ...middleCell,
        });
      }

      return {
        id: String(row?.rowIndex ?? rowIndex),
        rowIndex: Number.isFinite(row?.rowIndex) ? row.rowIndex : rowIndex,
        cells,
      };
    })
    .filter(Boolean);
}

function stripDateCellFromJodiRows(rows = []) {
  return rows.map((row) => {
    const cells = Array.isArray(row?.cells) ? row.cells : [];
    const firstText = String(cells[0]?.text ?? '').toLowerCase();
    const hasDateCell = firstText.includes(' to ') || /^\d{2}[/-]\d{2}[/-]\d{4}/.test(firstText);
    return {
      ...row,
      cells: hasDateCell ? cells.slice(1) : cells,
    };
  });
}

export function createMarketContentService({
  mode = 'mongo',
  cacheTtlMs = 300000,
  logger,
  legacyContentService,
  mongoEnabled = true,
} = {}) {
  const sourceMode = normalizeMode(mode);
  const cache = new Map();

  function getCacheKey(type, slug) {
    return `${type}:${slug}`;
  }

  function readCache(type, slug) {
    const entry = cache.get(getCacheKey(type, slug));
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      cache.delete(getCacheKey(type, slug));
      return null;
    }

    return clonePayload(entry.payload);
  }

  function writeCache(type, slug, payload) {
    const ttl = Number.isFinite(cacheTtlMs) && cacheTtlMs > 0 ? cacheTtlMs : 300000;
    cache.set(getCacheKey(type, slug), {
      expiresAt: Date.now() + ttl,
      payload: clonePayload(payload),
    });
  }

  function clearCache({ type, slug } = {}) {
    const normalizedType = type ? normalizeType(type) : '';
    const normalizedSlug = slug ? normalizeMarketSlug(slug) : '';

    if (normalizedType && normalizedSlug) {
      cache.delete(getCacheKey(normalizedType, normalizedSlug));
      return;
    }

    if (normalizedType) {
      for (const key of cache.keys()) {
        if (key.startsWith(`${normalizedType}:`)) {
          cache.delete(key);
        }
      }
      return;
    }

    cache.clear();
  }

  async function getFromLegacy(type, slug) {
    if (!legacyContentService) {
      throw new AppError('Legacy content service is unavailable', {
        statusCode: 503,
        code: 'MARKET_CONTENT_SOURCE_UNAVAILABLE',
      });
    }

    const artifact = legacyContentService.getMarketContent(type, slug);
    return toStructuredMarketContent(artifact);
  }

  async function getFromMongo(type, slug) {
    if (!mongoEnabled) {
      throw new AppError('Market content database is unavailable', {
        statusCode: 503,
        code: 'MARKET_CONTENT_DB_UNAVAILABLE',
      });
    }

    const market = await MarketContentMarketModel.findOne({
      type,
      slug,
      isActive: true,
    }).lean();

    if (!market) {
      throw new AppError('Market page not found', {
        statusCode: 404,
        code: 'MARKET_PAGE_NOT_FOUND',
      });
    }

    const [metaDoc, rowDocs, siblingPanelMarket] = await Promise.all([
      MarketMetaModel.findOne({
        marketId: market._id,
        type,
      }).lean(),
      MarketChartRowModel.find({
        marketId: market._id,
        type,
      })
        .sort({ rowIndex: 1 })
        .lean(),
      type === 'jodi'
        ? MarketContentMarketModel.findOne({
            type: 'panel',
            slug,
            isActive: true,
          }).lean()
        : Promise.resolve(null),
    ]);

    if (!metaDoc) {
      throw new AppError('Market content not ready', {
        statusCode: 503,
        code: 'MARKET_CONTENT_NOT_READY',
      });
    }

    const isAdminMarket = String(market.importSource ?? '') === 'admin';
    let resolvedRowDocs = isAdminMarket && type === 'panel'
      ? blankAdminTodayAndFuturePanelRows(rowDocs)
      : rowDocs;
    if (type === 'jodi' && siblingPanelMarket?._id) {
      const panelRows = await MarketChartRowModel.find({
        marketId: siblingPanelMarket._id,
        type: 'panel',
      })
        .sort({ rowIndex: 1 })
        .lean();
      const safePanelRows = isAdminMarket
        ? blankAdminTodayAndFuturePanelRows(panelRows)
        : panelRows;
      const derivedRows = toJodiRowsFromPanelRows(safePanelRows);
      if (derivedRows.length > 0) {
        resolvedRowDocs = derivedRows;
      }
    }
    if (type === 'jodi') {
      resolvedRowDocs = stripDateCellFromJodiRows(resolvedRowDocs);
    }

    const marketName = normalizeText(market.name).toUpperCase();
    const chartTypeLabel = type === 'panel' ? 'PANEL CHART' : 'JODI CHART';
    const columns = sanitizeColumns(metaDoc.table?.columns);
    const resolvedColumns = type === 'jodi' ? JODI_COLUMNS : columns;
    const rows = sanitizeRows(
      resolvedRowDocs.map((row) => ({
        id: String(row.rowIndex),
        rowIndex: row.rowIndex,
        cells: row.cells,
      })),
      resolvedColumns,
    );

    return {
      version: 2,
      type,
      slug,
      title: String(metaDoc.title ?? '').trim(),
      description: String(metaDoc.description ?? '').trim(),
      seo: {
        meta: Array.isArray(metaDoc.seo?.meta) ? metaDoc.seo.meta : [],
      },
      styles: {
        urls: Array.isArray(metaDoc.styleUrls) ? metaDoc.styleUrls : [],
        blocks: Array.isArray(metaDoc.styleBlocks) ? metaDoc.styleBlocks : [],
        jsonLdBlocks: Array.isArray(metaDoc.jsonLdBlocks) ? metaDoc.jsonLdBlocks : [],
      },
      hero: isAdminMarket
        ? {
            ...(metaDoc.hero ?? {}),
            chartTitle: `${marketName} ${chartTypeLabel}`,
            smallHeading: `${marketName} ${chartTypeLabel} RECORDS`,
            introText: buildAdminIntroText(marketName, type),
          }
        : metaDoc.hero ?? {},
      result: metaDoc.result ?? {},
      controls: metaDoc.controls ?? {
        topAnchorId: 'market-top',
        bottomAnchorId: 'market-bottom',
        goBottomLabel: 'Go to Bottom',
        goTopLabel: 'Go to Top',
      },
      table: {
        title: isAdminMarket
          ? type === 'jodi'
            ? `${marketName} JODI CHART`
            : `${marketName} MATKA PANEL RECORD 2023 - ${new Date().getFullYear()}`
          : String(metaDoc.table?.title ?? '').trim(),
        columns: resolvedColumns,
        attrs: metaDoc.table?.attrs && typeof metaDoc.table.attrs === 'object'
          ? { ...metaDoc.table.attrs }
          : {},
        headingAttrs:
          metaDoc.table?.headingAttrs && typeof metaDoc.table.headingAttrs === 'object'
            ? { ...metaDoc.table.headingAttrs }
            : {},
        titleAttrs:
          metaDoc.table?.titleAttrs && typeof metaDoc.table.titleAttrs === 'object'
            ? { ...metaDoc.table.titleAttrs }
            : {},
        rows,
      },
      footer: isAdminMarket
        ? buildAdminFooter(marketName, type, metaDoc.footer ?? {})
        : metaDoc.footer ?? {},
      importedAt: market.importedAt,
      updatedAt: metaDoc.updatedAt ?? market.updatedAt ?? null,
    };
  }

  async function getMarketContent(type, slug) {
    const normalizedType = normalizeType(type);
    const normalizedSlug = normalizeMarketSlug(slug);

    if (!normalizedSlug) {
      throw new AppError('Invalid market slug', {
        statusCode: 400,
        code: 'INVALID_MARKET_SLUG',
      });
    }

    const cached = readCache(normalizedType, normalizedSlug);
    if (cached) {
      logger?.info?.('market_content_cache_hit', {
        type: normalizedType,
        slug: normalizedSlug,
        sourceMode,
      });
      return cached;
    }

    const startedAt = Date.now();
    let payload;
    let source = sourceMode;

    if (sourceMode === 'legacy') {
      payload = await getFromLegacy(normalizedType, normalizedSlug);
    } else {
      try {
        payload = await getFromMongo(normalizedType, normalizedSlug);
      } catch (error) {
        if (!legacyContentService || !isRecoverableMongoError(error)) {
          throw error;
        }

        logger?.warn?.('market_content_mongo_fallback_legacy', {
          type: normalizedType,
          slug: normalizedSlug,
          reason: error.code || error.message || 'unknown_error',
        });

        payload = await getFromLegacy(normalizedType, normalizedSlug);
        source = 'legacy_fallback';
      }
    }

    writeCache(normalizedType, normalizedSlug, payload);
    logger?.info?.('market_content_cache_miss', {
      type: normalizedType,
      slug: normalizedSlug,
      sourceMode: source,
      durationMs: Date.now() - startedAt,
    });

    return clonePayload(payload);
  }

  return {
    mode: sourceMode,
    getMarketContent,
    clearCache,
  };
}
