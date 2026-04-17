import { successResponse } from '../utils/response.js';

function sanitizeMarketPayload(market) {
  return {
    id: String(market._id ?? market.id ?? ''),
    name: market.name,
    slug: market.slug,
    openTime: market.openTime,
    closeTime: market.closeTime,
    isActive: market.isActive,
    sortOrder: market.sortOrder,
    createdAt: market.createdAt,
    updatedAt: market.updatedAt,
  };
}

export function createV1AdminMarketsListController(matkaService) {
  return async (_request, response, next) => {
    try {
      const data = await matkaService.listAdminMarkets();
      response.json(successResponse(data, 'Fetched admin markets'));
    } catch (error) {
      next(error);
    }
  };
}

export function createV1AdminMarketsCreateController(matkaService, auditService) {
  return async (request, response, next) => {
    try {
      const created = await matkaService.createMarket(request.validatedBody);
      await auditService.log({
        adminUser: request.adminUser.username,
        action: 'market_create',
        entityType: 'market',
        entityId: String(created._id),
        before: null,
        after: sanitizeMarketPayload(created),
        ip: request.ip,
        userAgent: request.get('user-agent') ?? '',
      });

      response.status(201).json(successResponse(sanitizeMarketPayload(created), 'Market created'));
    } catch (error) {
      next(error);
    }
  };
}

export function createV1AdminMarketsPatchController(matkaService, auditService) {
  return async (request, response, next) => {
    try {
      const beforeState = (await matkaService.listAdminMarkets()).find(
        (market) => market.id === request.validatedParams.marketId,
      );

      const updated = await matkaService.updateMarket(
        request.validatedParams.marketId,
        request.validatedBody,
      );

      await auditService.log({
        adminUser: request.adminUser.username,
        action: 'market_update',
        entityType: 'market',
        entityId: String(updated._id),
        before: beforeState ?? null,
        after: sanitizeMarketPayload(updated),
        ip: request.ip,
        userAgent: request.get('user-agent') ?? '',
      });

      response.json(successResponse(sanitizeMarketPayload(updated), 'Market updated'));
    } catch (error) {
      next(error);
    }
  };
}

export function createV1AdminMarketsDeleteController(matkaService, auditService) {
  return async (request, response, next) => {
    try {
      const removed = await matkaService.deleteMarket(request.validatedParams.marketId);

      await auditService.log({
        adminUser: request.adminUser.username,
        action: 'market_delete',
        entityType: 'market',
        entityId: String(removed._id),
        before: sanitizeMarketPayload(removed),
        after: null,
        ip: request.ip,
        userAgent: request.get('user-agent') ?? '',
      });

      response.json(successResponse({ id: String(removed._id) }, 'Market deleted'));
    } catch (error) {
      next(error);
    }
  };
}

export function createV1AdminMarketsToggleController(matkaService, auditService) {
  return async (request, response, next) => {
    try {
      const updated = await matkaService.toggleMarketActive(request.validatedParams.marketId);

      await auditService.log({
        adminUser: request.adminUser.username,
        action: 'market_toggle_active',
        entityType: 'market',
        entityId: String(updated._id),
        before: null,
        after: { isActive: updated.isActive },
        ip: request.ip,
        userAgent: request.get('user-agent') ?? '',
      });

      response.json(successResponse(sanitizeMarketPayload(updated), 'Market active state updated'));
    } catch (error) {
      next(error);
    }
  };
}
