import { AppError } from '../utils/errors.js';
import { successResponse } from '../utils/response.js';
import { extractMarketLink, normalizeMarketSlug } from '../utils/market-links.js';
import { createSlug, parseResultParts } from '../utils/normalize.js';
import { mergeScraperAndMatkaRecords } from '../services/matka/matka-merge-service.js';

function toLivePayload(record) {
  const number = String(record.current?.number ?? '').trim();
  const parsed = parseResultParts(number);
  const resolvedJodi = String(record.current?.jodi ?? '').trim() || parsed.jodi || '';
  const resolvedPanel = String(record.current?.panel ?? '').trim() || parsed.panel || '';

  return {
    slug: record.slug,
    name: record.name,
    time: record.time,
    links: record.links,
    current: {
      number: number || parsed.number || '',
      jodi: resolvedJodi,
      panel: resolvedPanel,
    },
    stale: Boolean(record.stale),
    updatedAt: record.updated_at ?? null,
    lastChangedAt: record.last_changed_at ?? null,
  };
}

function collectSlugAliases(record) {
  const aliases = new Set();
  const pushAlias = (value) => {
    const normalized = normalizeMarketSlug(value);
    if (normalized) {
      aliases.add(normalized);
    }
  };

  pushAlias(record?.slug);
  pushAlias(createSlug(record?.name ?? ''));

  const jodiMatch = extractMarketLink(record?.links?.jodi ?? '');
  const panelMatch = extractMarketLink(record?.links?.panel ?? '');
  pushAlias(jodiMatch?.slug);
  pushAlias(panelMatch?.slug);

  return aliases;
}

function resolveLiveRecordBySlug(records = [], normalizedSlug = '') {
  if (!normalizedSlug) {
    return null;
  }

  const byAlias = new Map();
  for (const record of records) {
    for (const alias of collectSlugAliases(record)) {
      if (!byAlias.has(alias)) {
        byAlias.set(alias, record);
      }
    }
  }

  return byAlias.get(normalizedSlug) ?? null;
}

export function createV1MarketLiveController(store, matkaService) {
  return async (request, response, next) => {
    try {
      const normalizedSlug = normalizeMarketSlug(request.validatedParams?.slug);
      if (!normalizedSlug) {
        throw new AppError('Invalid market slug', {
          statusCode: 400,
          code: 'INVALID_MARKET_SLUG',
        });
      }

      const scraperRecords = store.getAllRecords();
      let matkaCards = [];
      if (matkaService) {
        try {
          matkaCards = await matkaService.listLiveMarkets();
        } catch {
          matkaCards = [];
        }
      }

      const mergedRecords = mergeScraperAndMatkaRecords(scraperRecords, matkaCards);
      const record = resolveLiveRecordBySlug(mergedRecords, normalizedSlug);
      if (!record) {
        throw new AppError('Market live data not found', {
          statusCode: 404,
          code: 'MARKET_LIVE_NOT_FOUND',
        });
      }

      response.setHeader('Cache-Control', 'no-store');
      response.json(successResponse(toLivePayload(record), 'Fetched market live data'));
    } catch (error) {
      next(error);
    }
  };
}
