import { successResponse } from '../utils/response.js';

async function resolveAdminMarket(matkaService, marketId = '') {
  const markets = await matkaService.listAdminMarkets();
  return markets.find((market) => String(market.id) === String(marketId)) ?? null;
}

export function createV1AdminOpenPanelController(matkaService, auditService, realtimeService) {
  return async (request, response, next) => {
    try {
      const updated = await matkaService.upsertOpenPanel({
        marketId: request.validatedParams.marketId,
        panel: request.validatedBody.panel,
        adminUser: request.adminUser.username,
      });

      await auditService.log({
        adminUser: request.adminUser.username,
        action: 'result_open_update',
        entityType: 'market_result',
        entityId: String(updated._id),
        before: null,
        after: {
          openPanel: updated.openPanel,
          openSingle: updated.openSingle,
          middleJodi: updated.middleJodi,
        },
        ip: request.ip,
        userAgent: request.get('user-agent') ?? '',
      });

      const cards = await matkaService.listLiveMarkets();
      realtimeService.emit('matka:markets_updated', {
        markets: cards,
        updatedAt: new Date().toISOString(),
      });
      realtimeService.emit('matka:market_result_updated', {
        marketId: request.validatedParams.marketId,
        updatedAt: new Date().toISOString(),
      });

      response.json(successResponse(updated, 'Open panel updated'));
    } catch (error) {
      next(error);
    }
  };
}

export function createV1AdminClosePanelController({
  matkaService,
  auditService,
  realtimeService,
  marketContentAdminService,
  marketContentService,
}) {
  return async (request, response, next) => {
    try {
      const updated = await matkaService.upsertClosePanel({
        marketId: request.validatedParams.marketId,
        panel: request.validatedBody.panel,
        adminUser: request.adminUser.username,
      });

      await auditService.log({
        adminUser: request.adminUser.username,
        action: 'result_close_update',
        entityType: 'market_result',
        entityId: String(updated._id),
        before: null,
        after: {
          closePanel: updated.closePanel,
          closeSingle: updated.closeSingle,
          middleJodi: updated.middleJodi,
          displayResult: updated.displayResult,
        },
        ip: request.ip,
        userAgent: request.get('user-agent') ?? '',
      });

      if (updated.openPanel && updated.closePanel && marketContentAdminService?.addCompletedResultToCharts) {
        const market = await resolveAdminMarket(matkaService, request.validatedParams.marketId);
        if (market) {
          const savedChartRows = await marketContentAdminService.addCompletedResultToCharts({
            market,
            result: updated,
          });
          for (const syncedType of savedChartRows.syncedTypes ?? []) {
            marketContentService?.clearCache?.({
              type: syncedType,
              slug: market.slug,
            });
          }
        }
      }

      const cards = await matkaService.listLiveMarkets();
      realtimeService.emit('matka:markets_updated', {
        markets: cards,
        updatedAt: new Date().toISOString(),
      });
      realtimeService.emit('matka:market_result_updated', {
        marketId: request.validatedParams.marketId,
        updatedAt: new Date().toISOString(),
      });

      response.json(successResponse(updated, 'Close panel updated'));
    } catch (error) {
      next(error);
    }
  };
}
