import { AppError } from '../../utils/errors.js';
import { normalizeMarketSlug } from '../../utils/market-links.js';
import { MarketContentMarketModel } from '../../models/market-content-market-model.js';
import { MarketChartRowModel } from '../../models/market-chart-row-model.js';
import { MarketMetaModel } from '../../models/market-meta-model.js';
import { toStructuredMarketContent } from './market-content-transform.js';

function normalizeType(value = '') {
  return String(value).toLowerCase() === 'panel' ? 'panel' : 'jodi';
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

    const [metaDoc, rowDocs] = await Promise.all([
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
    ]);

    if (!metaDoc) {
      throw new AppError('Market content not ready', {
        statusCode: 503,
        code: 'MARKET_CONTENT_NOT_READY',
      });
    }

    const columns = sanitizeColumns(metaDoc.table?.columns);
    const rows = sanitizeRows(
      rowDocs.map((row) => ({
        id: String(row.rowIndex),
        rowIndex: row.rowIndex,
        cells: row.cells,
      })),
      columns,
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
      hero: metaDoc.hero ?? {},
      result: metaDoc.result ?? {},
      controls: metaDoc.controls ?? {
        topAnchorId: 'market-top',
        bottomAnchorId: 'market-bottom',
        goBottomLabel: 'Go to Bottom',
        goTopLabel: 'Go to Top',
      },
      table: {
        title: String(metaDoc.table?.title ?? '').trim(),
        columns,
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
      footer: metaDoc.footer ?? {},
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
