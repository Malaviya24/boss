import { AppError } from '../utils/errors.js';
import { successResponse } from '../utils/response.js';

async function resolveAdminMarket(matkaService, marketId = '') {
  const markets = await matkaService.listAdminMarkets();
  const matched = markets.find((market) => String(market.id) === String(marketId));
  if (!matched) {
    throw new AppError('Market not found', {
      statusCode: 404,
      code: 'MARKET_NOT_FOUND',
    });
  }
  return matched;
}

export function createV1AdminMarketChartSeedController({
  matkaService,
  marketContentAdminService,
  marketContentService,
  auditService,
  realtimeService,
}) {
  return async (request, response, next) => {
    try {
      const marketId = request.validatedParams.marketId;
      const type = request.validatedParams.type;
      const market = await resolveAdminMarket(matkaService, marketId);
      const seeded = await marketContentAdminService.seedRandomHistory({
        market,
        type,
        startYear: request.validatedBody.startYear,
        replace: request.validatedBody.replace,
      });

      if (seeded.latestCompletedResult && matkaService?.upsertHistoricalResult) {
        await matkaService.upsertHistoricalResult({
          marketId,
          resultDate: seeded.latestCompletedResult.resultDate,
          openPanel: seeded.latestCompletedResult.openPanel,
          closePanel: seeded.latestCompletedResult.closePanel,
          adminUser: request.adminUser.username,
        });
      }

      for (const syncedType of seeded.syncedTypes ?? [type]) {
        marketContentService?.clearCache?.({
          type: syncedType,
          slug: seeded.slug,
        });
      }

      if (auditService?.log) {
        await auditService.log({
          adminUser: request.adminUser.username,
          action: 'market_chart_seed_random',
          entityType: 'market_content',
          entityId: `${seeded.type}:${seeded.slug}`,
          before: null,
          after: {
            ...seeded,
            marketName: market.name,
            marketSlug: market.slug,
          },
          ip: request.ip,
          userAgent: request.get('user-agent') ?? '',
        });
      }

      if (realtimeService?.emit) {
        const cards = await matkaService.listLiveMarkets();
        realtimeService.emit('matka:markets_updated', {
          markets: cards,
          updatedAt: new Date().toISOString(),
        });
      }

      response.json(successResponse(seeded, 'Random chart history generated'));
    } catch (error) {
      next(error);
    }
  };
}

export function createV1AdminMarketChartManualRowController({
  matkaService,
  marketContentAdminService,
  marketContentService,
  auditService,
}) {
  return async (request, response, next) => {
    try {
      const marketId = request.validatedParams.marketId;
      const type = request.validatedParams.type;
      const market = await resolveAdminMarket(matkaService, marketId);
      const saved = await marketContentAdminService.addManualRow({
        market,
        type,
        dateRange: request.validatedBody.dateRange,
        days: request.validatedBody.days,
        rowIndex: request.validatedBody.rowIndex,
      });

      for (const syncedType of saved.syncedTypes ?? [type]) {
        marketContentService?.clearCache?.({
          type: syncedType,
          slug: saved.slug,
        });
      }

      if (auditService?.log) {
        await auditService.log({
          adminUser: request.adminUser.username,
          action: 'market_chart_manual_row_add',
          entityType: 'market_content',
          entityId: `${saved.type}:${saved.slug}`,
          before: null,
          after: {
            ...saved,
            marketName: market.name,
            marketSlug: market.slug,
          },
          ip: request.ip,
          userAgent: request.get('user-agent') ?? '',
        });
      }

      response.json(successResponse(saved, 'Manual chart row saved'));
    } catch (error) {
      next(error);
    }
  };
}
