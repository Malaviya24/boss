import { AppError } from '../../utils/errors.js';
import { createSlug } from '../../utils/normalize.js';
import { MatkaMarketModel } from '../../models/matka-market-model.js';
import { MatkaMarketResultModel } from '../../models/matka-market-result-model.js';
import { calculateFromPanels } from './matka-calculation-service.js';
import { toLiveMarketCard } from './matka-phase-service.js';
import {
  getCurrentDateKey,
  getScheduledDateForToday,
  normalizeMarketTime,
} from './matka-time-service.js';

function toObjectIdString(value) {
  return String(value ?? '');
}

function ensurePanel(value = '') {
  const normalized = String(value).trim();
  if (!/^\d{3}$/.test(normalized)) {
    throw new AppError('Panel must be a 3-digit number', {
      statusCode: 400,
      code: 'INVALID_PANEL',
    });
  }
  return normalized;
}

function handleMongoError(error) {
  if (error?.code === 11000) {
    throw new AppError('Market already exists', {
      statusCode: 409,
      code: 'MARKET_ALREADY_EXISTS',
    });
  }

  throw error;
}

async function loadTodayResultsMap(markets, dateKey) {
  if (markets.length === 0) {
    return new Map();
  }

  const marketIds = markets.map((market) => market._id);
  const results = await MatkaMarketResultModel.find({
    marketId: { $in: marketIds },
    resultDate: dateKey,
  }).lean();

  const byMarketId = new Map();
  for (const result of results) {
    byMarketId.set(toObjectIdString(result.marketId), result);
  }
  return byMarketId;
}

async function loadLatestResultsMap(markets, beforeDateKey) {
  if (markets.length === 0) {
    return new Map();
  }

  const marketIds = markets.map((market) => market._id);
  const results = await MatkaMarketResultModel.find({
    marketId: { $in: marketIds },
    resultDate: { $lt: beforeDateKey },
    displayResult: { $ne: '' },
  })
    .sort({ resultDate: -1, updatedAt: -1 })
    .lean();

  const byMarketId = new Map();
  for (const result of results) {
    const key = toObjectIdString(result.marketId);
    if (!byMarketId.has(key)) {
      byMarketId.set(key, {
        ...result,
        isFallbackResult: true,
      });
    }
  }
  return byMarketId;
}

export function createMatkaService({ env }) {
  const mongoEnabled = Boolean(env.mongoUri);
  const enabled = true;
  const timeZone = env.matkaTimezone;
  const loadingMs = env.matkaRevealLoadingMs;
  const preRevealLeadMs = env.matkaPreRevealLoadingMs;
  const openResultVisibleMs = env.matkaOpenResultVisibleMs;
  const priorityLeadMs = env.matkaPriorityLeadMs;
  const memoryState = {
    marketSeq: 1,
    markets: [],
    resultsByKey: new Map(),
  };

  function getResultKey(marketId, dateKey) {
    return `${marketId}::${dateKey}`;
  }

  function getMemoryResult(marketId, dateKey) {
    return memoryState.resultsByKey.get(getResultKey(marketId, dateKey)) ?? null;
  }

  function setMemoryResult(marketId, dateKey, payload) {
    memoryState.resultsByKey.set(getResultKey(marketId, dateKey), payload);
    return payload;
  }

  function compareLiveCards(left, right) {
    const priorityDelta = (left.priorityRank ?? 1) - (right.priorityRank ?? 1);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const sourceDelta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
    if (sourceDelta !== 0) {
      return sourceDelta;
    }

    return String(left.name ?? '').localeCompare(String(right.name ?? ''));
  }

  async function listLiveMarkets() {
    if (!mongoEnabled) {
      const dateKey = getCurrentDateKey(timeZone);
      return memoryState.markets
        .filter((market) => market.isActive)
        .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
        .map((market) =>
          toLiveMarketCard({
            market,
            result: getMemoryResult(market._id, dateKey),
            timeZone,
            loadingMs,
            preRevealLeadMs,
            openResultVisibleMs,
            priorityLeadMs,
          }),
        )
        .sort(compareLiveCards);
    }

    const markets = await MatkaMarketModel.find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    const dateKey = getCurrentDateKey(timeZone);
    const [resultsMap, latestResultsMap] = await Promise.all([
      loadTodayResultsMap(markets, dateKey),
      loadLatestResultsMap(markets, dateKey),
    ]);

    return markets
      .map((market) =>
        toLiveMarketCard({
        market,
        result:
          resultsMap.get(toObjectIdString(market._id)) ??
          latestResultsMap.get(toObjectIdString(market._id)) ??
          null,
        timeZone,
        loadingMs,
        preRevealLeadMs,
        openResultVisibleMs,
          priorityLeadMs,
        }),
      )
      .sort(compareLiveCards);
  }

  async function getLiveMarketBySlug(slug) {
    const normalizedSlug = createSlug(slug);
    if (!normalizedSlug) {
      throw new AppError('Invalid market slug', {
        statusCode: 400,
        code: 'INVALID_MARKET_SLUG',
      });
    }

    if (!mongoEnabled) {
      const market = memoryState.markets.find(
        (item) => item.slug === normalizedSlug && item.isActive,
      );
      if (!market) {
        throw new AppError('Market not found', {
          statusCode: 404,
          code: 'MARKET_NOT_FOUND',
        });
      }
      const dateKey = getCurrentDateKey(timeZone);
      const result = getMemoryResult(market._id, dateKey);
      return toLiveMarketCard({
        market,
        result,
        timeZone,
        loadingMs,
        preRevealLeadMs,
        openResultVisibleMs,
        priorityLeadMs,
      });
    }

    const market = await MatkaMarketModel.findOne({ slug: normalizedSlug, isActive: true }).lean();
    if (!market) {
      throw new AppError('Market not found', {
        statusCode: 404,
        code: 'MARKET_NOT_FOUND',
      });
    }

    const dateKey = getCurrentDateKey(timeZone);
    const todayResult = await MatkaMarketResultModel.findOne({
      marketId: market._id,
      resultDate: dateKey,
    }).lean();
    const fallbackResult = todayResult
      ? null
      : await MatkaMarketResultModel.findOne({
      marketId: market._id,
      resultDate: { $lt: dateKey },
      displayResult: { $ne: '' },
    })
      .sort({ resultDate: -1, updatedAt: -1 })
      .lean();
    const result = todayResult || (fallbackResult ? { ...fallbackResult, isFallbackResult: true } : null);

    return toLiveMarketCard({
      market,
      result,
      timeZone,
      loadingMs,
      preRevealLeadMs,
      openResultVisibleMs,
      priorityLeadMs,
    });
  }

  async function listAdminMarkets() {
    if (!mongoEnabled) {
      const dateKey = getCurrentDateKey(timeZone);
      return memoryState.markets
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
        .map((market) => {
          const result = getMemoryResult(market._id, dateKey);
          return {
            id: market._id,
            name: market.name,
            slug: market.slug,
            openTime: market.openTime,
            closeTime: market.closeTime,
            isActive: market.isActive,
            sortOrder: market.sortOrder,
            createdAt: market.createdAt,
            updatedAt: market.updatedAt,
            todayResult: result
              ? {
                  openPanel: result.openPanel || '',
                  closePanel: result.closePanel || '',
                  openSingle: result.openSingle || '',
                  closeSingle: result.closeSingle || '',
                  middleJodi: result.middleJodi || '',
                  displayResult: result.displayResult || '',
                  openRevealAt: result.openRevealAt || null,
                  closeRevealAt: result.closeRevealAt || null,
                  updatedAt: result.updatedAt || null,
                }
              : null,
          };
        });
    }

    const markets = await MatkaMarketModel.find({})
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    const dateKey = getCurrentDateKey(timeZone);
    const resultsMap = await loadTodayResultsMap(markets, dateKey);

    return markets.map((market) => {
      const result = resultsMap.get(toObjectIdString(market._id)) ?? null;
      return {
        id: toObjectIdString(market._id),
        name: market.name,
        slug: market.slug,
        openTime: market.openTime,
        closeTime: market.closeTime,
        isActive: market.isActive,
        sortOrder: market.sortOrder,
        createdAt: market.createdAt,
        updatedAt: market.updatedAt,
        todayResult: result
          ? {
              openPanel: result.openPanel || '',
              closePanel: result.closePanel || '',
              openSingle: result.openSingle || '',
              closeSingle: result.closeSingle || '',
              middleJodi: result.middleJodi || '',
              displayResult: result.displayResult || '',
              openRevealAt: result.openRevealAt || null,
              closeRevealAt: result.closeRevealAt || null,
              updatedAt: result.updatedAt || null,
            }
          : null,
      };
    });
  }

  async function createMarket(payload) {
    if (!mongoEnabled) {
      const name = String(payload.name).trim().toUpperCase();
      const slug = createSlug(name);
      if (!slug) {
        throw new AppError('Invalid market name', {
          statusCode: 400,
          code: 'INVALID_MARKET_NAME',
        });
      }
      const duplicate = memoryState.markets.find((item) => item.slug === slug && item.isActive);
      if (duplicate) {
        throw new AppError('Market already exists', {
          statusCode: 409,
          code: 'MARKET_ALREADY_EXISTS',
        });
      }
      const now = new Date().toISOString();
      const market = {
        _id: `mem-market-${memoryState.marketSeq++}`,
        name,
        slug,
        openTime: normalizeMarketTime(payload.openTime),
        closeTime: normalizeMarketTime(payload.closeTime),
        sortOrder: Number.isFinite(payload.sortOrder) ? payload.sortOrder : 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      memoryState.markets.push(market);
      return market;
    }

    try {
      const name = String(payload.name).trim().toUpperCase();
      const slug = createSlug(name);
      if (!slug) {
        throw new AppError('Invalid market name', {
          statusCode: 400,
          code: 'INVALID_MARKET_NAME',
        });
      }

      const market = await MatkaMarketModel.create({
        name,
        slug,
        openTime: normalizeMarketTime(payload.openTime),
        closeTime: normalizeMarketTime(payload.closeTime),
        sortOrder: Number.isFinite(payload.sortOrder) ? payload.sortOrder : 0,
        isActive: true,
      });

      return market.toObject();
    } catch (error) {
      handleMongoError(error);
    }
  }

  async function updateMarket(marketId, patch) {
    if (!mongoEnabled) {
      const market = memoryState.markets.find((item) => item._id === marketId);
      if (!market) {
        throw new AppError('Market not found', {
          statusCode: 404,
          code: 'MARKET_NOT_FOUND',
        });
      }
      if (patch.name !== undefined) {
        const nextName = String(patch.name).trim().toUpperCase();
        const nextSlug = createSlug(nextName);
        const duplicate = memoryState.markets.find(
          (item) => item._id !== marketId && item.slug === nextSlug && item.isActive,
        );
        if (duplicate) {
          throw new AppError('Market already exists', {
            statusCode: 409,
            code: 'MARKET_ALREADY_EXISTS',
          });
        }
        market.name = nextName;
        market.slug = nextSlug;
      }
      if (patch.openTime !== undefined) {
        market.openTime = normalizeMarketTime(patch.openTime);
      }
      if (patch.closeTime !== undefined) {
        market.closeTime = normalizeMarketTime(patch.closeTime);
      }
      if (patch.sortOrder !== undefined) {
        market.sortOrder = patch.sortOrder;
      }
      market.updatedAt = new Date().toISOString();
      return { ...market };
    }

    const market = await MatkaMarketModel.findById(marketId);
    if (!market) {
      throw new AppError('Market not found', {
        statusCode: 404,
        code: 'MARKET_NOT_FOUND',
      });
    }

    if (patch.name !== undefined) {
      const nextName = String(patch.name).trim().toUpperCase();
      market.name = nextName;
      market.slug = createSlug(nextName);
    }
    if (patch.openTime !== undefined) {
      market.openTime = normalizeMarketTime(patch.openTime);
    }
    if (patch.closeTime !== undefined) {
      market.closeTime = normalizeMarketTime(patch.closeTime);
    }
    if (patch.sortOrder !== undefined) {
      market.sortOrder = patch.sortOrder;
    }

    try {
      await market.save();
      return market.toObject();
    } catch (error) {
      handleMongoError(error);
    }
  }

  async function deleteMarket(marketId) {
    if (!mongoEnabled) {
      const index = memoryState.markets.findIndex((item) => item._id === marketId);
      if (index < 0) {
        throw new AppError('Market not found', {
          statusCode: 404,
          code: 'MARKET_NOT_FOUND',
        });
      }
      const [removed] = memoryState.markets.splice(index, 1);
      for (const key of memoryState.resultsByKey.keys()) {
        if (key.startsWith(`${marketId}::`)) {
          memoryState.resultsByKey.delete(key);
        }
      }
      return removed;
    }

    const market = await MatkaMarketModel.findById(marketId);
    if (!market) {
      throw new AppError('Market not found', {
        statusCode: 404,
        code: 'MARKET_NOT_FOUND',
      });
    }

    await MatkaMarketResultModel.deleteMany({ marketId: market._id });
    await market.deleteOne();
    return market.toObject();
  }

  async function toggleMarketActive(marketId) {
    if (!mongoEnabled) {
      const market = memoryState.markets.find((item) => item._id === marketId);
      if (!market) {
        throw new AppError('Market not found', {
          statusCode: 404,
          code: 'MARKET_NOT_FOUND',
        });
      }
      market.isActive = !market.isActive;
      market.updatedAt = new Date().toISOString();
      return { ...market };
    }

    const market = await MatkaMarketModel.findById(marketId);
    if (!market) {
      throw new AppError('Market not found', {
        statusCode: 404,
        code: 'MARKET_NOT_FOUND',
      });
    }

    market.isActive = !market.isActive;
    await market.save();
    return market.toObject();
  }

  async function upsertOpenPanel({ marketId, panel, adminUser }) {
    if (!mongoEnabled) {
      const market = memoryState.markets.find((item) => item._id === marketId);
      if (!market) {
        throw new AppError('Market not found', {
          statusCode: 404,
          code: 'MARKET_NOT_FOUND',
        });
      }

      const normalizedPanel = ensurePanel(panel);
      const dateKey = getCurrentDateKey(timeZone);
      const now = new Date();
      const openAt = getScheduledDateForToday(market.openTime, timeZone);
      const revealAt = now.getTime() < openAt.getTime() ? openAt : now;
      const existing =
        getMemoryResult(market._id, dateKey) ?? {
          marketId: market._id,
          resultDate: dateKey,
          openPanel: '',
          closePanel: '',
          openSingle: '',
          closeSingle: '',
          jodiLeft: '',
          jodiRight: '',
          middleJodi: '',
          displayResult: '',
          openRevealAt: null,
          closeRevealAt: null,
          openUpdatedBy: '',
          closeUpdatedBy: '',
          createdAt: new Date().toISOString(),
        };

      existing.openPanel = normalizedPanel;
      existing.openRevealAt = revealAt;
      existing.openUpdatedBy = adminUser;
      const derived = calculateFromPanels({
        openPanel: existing.openPanel,
        closePanel: existing.closePanel,
      });
      existing.openSingle = derived.openSingle;
      existing.closeSingle = derived.closeSingle;
      existing.jodiLeft = derived.jodiLeft;
      existing.jodiRight = derived.jodiRight;
      existing.middleJodi = derived.middleJodi;
      existing.displayResult = derived.displayResult;
      existing.updatedAt = new Date().toISOString();
      return setMemoryResult(market._id, dateKey, existing);
    }

    const market = await MatkaMarketModel.findById(marketId).lean();
    if (!market) {
      throw new AppError('Market not found', {
        statusCode: 404,
        code: 'MARKET_NOT_FOUND',
      });
    }

    const normalizedPanel = ensurePanel(panel);
    const dateKey = getCurrentDateKey(timeZone);
    const now = new Date();
    const openAt = getScheduledDateForToday(market.openTime, timeZone);
    const revealAt = now.getTime() < openAt.getTime() ? openAt : now;

    const result =
      (await MatkaMarketResultModel.findOne({
        marketId: market._id,
        resultDate: dateKey,
      })) ||
      new MatkaMarketResultModel({
        marketId: market._id,
        resultDate: dateKey,
      });

    result.openPanel = normalizedPanel;
    result.openRevealAt = revealAt;
    result.openUpdatedBy = adminUser;

    const derived = calculateFromPanels({
      openPanel: result.openPanel,
      closePanel: result.closePanel,
    });
    result.openSingle = derived.openSingle;
    result.closeSingle = derived.closeSingle;
    result.jodiLeft = derived.jodiLeft;
    result.jodiRight = derived.jodiRight;
    result.middleJodi = derived.middleJodi;
    result.displayResult = derived.displayResult;

    await result.save();
    return result.toObject();
  }

  async function upsertClosePanel({ marketId, panel, adminUser }) {
    if (!mongoEnabled) {
      const market = memoryState.markets.find((item) => item._id === marketId);
      if (!market) {
        throw new AppError('Market not found', {
          statusCode: 404,
          code: 'MARKET_NOT_FOUND',
        });
      }

      const normalizedPanel = ensurePanel(panel);
      const dateKey = getCurrentDateKey(timeZone);
      const now = new Date();
      const closeAt = getScheduledDateForToday(market.closeTime, timeZone);
      const revealAt = now.getTime() < closeAt.getTime() ? closeAt : now;
      const existing =
        getMemoryResult(market._id, dateKey) ?? {
          marketId: market._id,
          resultDate: dateKey,
          openPanel: '',
          closePanel: '',
          openSingle: '',
          closeSingle: '',
          jodiLeft: '',
          jodiRight: '',
          middleJodi: '',
          displayResult: '',
          openRevealAt: null,
          closeRevealAt: null,
          openUpdatedBy: '',
          closeUpdatedBy: '',
          createdAt: new Date().toISOString(),
        };

      existing.closePanel = normalizedPanel;
      existing.closeRevealAt = revealAt;
      existing.closeUpdatedBy = adminUser;
      const derived = calculateFromPanels({
        openPanel: existing.openPanel,
        closePanel: existing.closePanel,
      });
      existing.openSingle = derived.openSingle;
      existing.closeSingle = derived.closeSingle;
      existing.jodiLeft = derived.jodiLeft;
      existing.jodiRight = derived.jodiRight;
      existing.middleJodi = derived.middleJodi;
      existing.displayResult = derived.displayResult;
      existing.updatedAt = new Date().toISOString();
      return setMemoryResult(market._id, dateKey, existing);
    }

    const market = await MatkaMarketModel.findById(marketId).lean();
    if (!market) {
      throw new AppError('Market not found', {
        statusCode: 404,
        code: 'MARKET_NOT_FOUND',
      });
    }

    const normalizedPanel = ensurePanel(panel);
    const dateKey = getCurrentDateKey(timeZone);
    const now = new Date();
    const closeAt = getScheduledDateForToday(market.closeTime, timeZone);
    const revealAt = now.getTime() < closeAt.getTime() ? closeAt : now;

    const result =
      (await MatkaMarketResultModel.findOne({
        marketId: market._id,
        resultDate: dateKey,
      })) ||
      new MatkaMarketResultModel({
        marketId: market._id,
        resultDate: dateKey,
      });

    result.closePanel = normalizedPanel;
    result.closeRevealAt = revealAt;
    result.closeUpdatedBy = adminUser;

    const derived = calculateFromPanels({
      openPanel: result.openPanel,
      closePanel: result.closePanel,
    });
    result.openSingle = derived.openSingle;
    result.closeSingle = derived.closeSingle;
    result.jodiLeft = derived.jodiLeft;
    result.jodiRight = derived.jodiRight;
    result.middleJodi = derived.middleJodi;
    result.displayResult = derived.displayResult;

    await result.save();
    return result.toObject();
  }

  async function upsertHistoricalResult({ marketId, resultDate, openPanel, closePanel, adminUser }) {
    const normalizedOpenPanel = ensurePanel(openPanel);
    const normalizedClosePanel = ensurePanel(closePanel);
    const dateKey = String(resultDate ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new AppError('Invalid result date', {
        statusCode: 400,
        code: 'INVALID_RESULT_DATE',
      });
    }

    const derived = calculateFromPanels({
      openPanel: normalizedOpenPanel,
      closePanel: normalizedClosePanel,
    });
    const revealAt = new Date(`${dateKey}T23:59:00.000Z`);

    if (!mongoEnabled) {
      const market = memoryState.markets.find((item) => item._id === marketId);
      if (!market) {
        throw new AppError('Market not found', {
          statusCode: 404,
          code: 'MARKET_NOT_FOUND',
        });
      }

      return setMemoryResult(market._id, dateKey, {
        marketId: market._id,
        resultDate: dateKey,
        openPanel: derived.openPanel,
        closePanel: derived.closePanel,
        openSingle: derived.openSingle,
        closeSingle: derived.closeSingle,
        jodiLeft: derived.jodiLeft,
        jodiRight: derived.jodiRight,
        middleJodi: derived.middleJodi,
        displayResult: derived.displayResult,
        openRevealAt: revealAt.toISOString(),
        closeRevealAt: revealAt.toISOString(),
        openUpdatedBy: adminUser,
        closeUpdatedBy: adminUser,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    }

    const market = await MatkaMarketModel.findById(marketId).lean();
    if (!market) {
      throw new AppError('Market not found', {
        statusCode: 404,
        code: 'MARKET_NOT_FOUND',
      });
    }

    const result =
      (await MatkaMarketResultModel.findOne({
        marketId: market._id,
        resultDate: dateKey,
      })) ||
      new MatkaMarketResultModel({
        marketId: market._id,
        resultDate: dateKey,
      });

    result.openPanel = derived.openPanel;
    result.closePanel = derived.closePanel;
    result.openSingle = derived.openSingle;
    result.closeSingle = derived.closeSingle;
    result.jodiLeft = derived.jodiLeft;
    result.jodiRight = derived.jodiRight;
    result.middleJodi = derived.middleJodi;
    result.displayResult = derived.displayResult;
    result.openRevealAt = revealAt;
    result.closeRevealAt = revealAt;
    result.openUpdatedBy = adminUser;
    result.closeUpdatedBy = adminUser;

    await result.save();
    return result.toObject();
  }

  return {
    enabled,
    mode: mongoEnabled ? 'mongo' : 'memory',
    timeZone,
    loadingMs,
    preRevealLeadMs,
    openResultVisibleMs,
    priorityLeadMs,
    listLiveMarkets,
    getLiveMarketBySlug,
    listAdminMarkets,
    createMarket,
    updateMarket,
    deleteMarket,
    toggleMarketActive,
    upsertOpenPanel,
    upsertClosePanel,
    upsertHistoricalResult,
  };
}
