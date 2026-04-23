import { Router } from 'express';
import { validateBody, validateParams, validateQuery } from '../../middlewares/validate.js';
import {
  matkaAuditQuerySchema,
  matkaChartManualRowBodySchema,
  matkaChartSeedBodySchema,
  matkaLoginBodySchema,
  matkaMarketCreateSchema,
  matkaMarketChartTypeParamsSchema,
  matkaMarketIdParamsSchema,
  matkaMarketPatchSchema,
  matkaMarketSlugParamsSchema,
  matkaPanelUpdateSchema,
} from '../../models/matka-validators.js';
import {
  createMatkaAdminAuthMiddleware,
  createMatkaEnabledGuard,
  matkaNoIndexHeader,
} from '../../middlewares/matka-auth.js';
import {
  createV1AdminLoginController,
  createV1AdminLogoutController,
  createV1AdminMeController,
} from '../../controllers/v1-admin-auth-controller.js';
import {
  createV1AdminMarketsCreateController,
  createV1AdminMarketsDeleteController,
  createV1AdminMarketsListController,
  createV1AdminMarketsPatchController,
  createV1AdminMarketsToggleController,
} from '../../controllers/v1-admin-markets-controller.js';
import {
  createV1AdminClosePanelController,
  createV1AdminOpenPanelController,
} from '../../controllers/v1-admin-results-controller.js';
import { createV1AdminAuditLogsController } from '../../controllers/v1-admin-audit-controller.js';
import {
  createV1AdminMarketChartManualRowController,
  createV1AdminMarketChartSeedController,
} from '../../controllers/v1-admin-market-content-controller.js';
import {
  createV1LiveMarketBySlugController,
  createV1LiveMarketsController,
} from '../../controllers/v1-live-markets-controller.js';

export function createV1MatkaRoutes({
  matkaService,
  matkaAuthService,
  auditService,
  realtimeService,
  adminLoginLimiter,
  marketContentAdminService,
  marketContentService,
}) {
  const router = Router();

  const ensureMatkaEnabled = createMatkaEnabledGuard(matkaService);
  const requireAdminAuth = createMatkaAdminAuthMiddleware(matkaAuthService);

  router.get('/live/markets', ensureMatkaEnabled, createV1LiveMarketsController(matkaService));
  router.get(
    '/live/markets/:slug',
    ensureMatkaEnabled,
    validateParams(matkaMarketSlugParamsSchema),
    createV1LiveMarketBySlugController(matkaService),
  );

  router.post(
    '/admin/auth/login',
    matkaNoIndexHeader,
    ensureMatkaEnabled,
    adminLoginLimiter,
    validateBody(matkaLoginBodySchema),
    createV1AdminLoginController(matkaAuthService, auditService),
  );

  router.post(
    '/admin/auth/logout',
    matkaNoIndexHeader,
    ensureMatkaEnabled,
    requireAdminAuth,
    createV1AdminLogoutController(),
  );

  router.get(
    '/admin/auth/me',
    matkaNoIndexHeader,
    ensureMatkaEnabled,
    requireAdminAuth,
    createV1AdminMeController(),
  );

  router.get(
    '/admin/markets',
    matkaNoIndexHeader,
    ensureMatkaEnabled,
    requireAdminAuth,
    createV1AdminMarketsListController(matkaService),
  );
  router.post(
    '/admin/markets',
    matkaNoIndexHeader,
    ensureMatkaEnabled,
    requireAdminAuth,
    validateBody(matkaMarketCreateSchema),
    createV1AdminMarketsCreateController(matkaService, auditService),
  );
  router.patch(
    '/admin/markets/:marketId',
    matkaNoIndexHeader,
    ensureMatkaEnabled,
    requireAdminAuth,
    validateParams(matkaMarketIdParamsSchema),
    validateBody(matkaMarketPatchSchema),
    createV1AdminMarketsPatchController(matkaService, auditService),
  );
  router.delete(
    '/admin/markets/:marketId',
    matkaNoIndexHeader,
    ensureMatkaEnabled,
    requireAdminAuth,
    validateParams(matkaMarketIdParamsSchema),
    createV1AdminMarketsDeleteController(matkaService, auditService),
  );
  router.patch(
    '/admin/markets/:marketId/toggle-active',
    matkaNoIndexHeader,
    ensureMatkaEnabled,
    requireAdminAuth,
    validateParams(matkaMarketIdParamsSchema),
    createV1AdminMarketsToggleController(matkaService, auditService),
  );
  router.put(
    '/admin/markets/:marketId/results/open',
    matkaNoIndexHeader,
    ensureMatkaEnabled,
    requireAdminAuth,
    validateParams(matkaMarketIdParamsSchema),
    validateBody(matkaPanelUpdateSchema),
    createV1AdminOpenPanelController(matkaService, auditService, realtimeService),
  );
  router.put(
    '/admin/markets/:marketId/results/close',
    matkaNoIndexHeader,
    ensureMatkaEnabled,
    requireAdminAuth,
    validateParams(matkaMarketIdParamsSchema),
    validateBody(matkaPanelUpdateSchema),
    createV1AdminClosePanelController(matkaService, auditService, realtimeService),
  );

  router.post(
    '/admin/markets/:marketId/chart-data/:type/seed',
    matkaNoIndexHeader,
    ensureMatkaEnabled,
    requireAdminAuth,
    validateParams(matkaMarketChartTypeParamsSchema),
    validateBody(matkaChartSeedBodySchema),
    createV1AdminMarketChartSeedController({
      matkaService,
      marketContentAdminService,
      marketContentService,
      auditService,
      realtimeService,
    }),
  );

  router.post(
    '/admin/markets/:marketId/chart-data/:type/manual-row',
    matkaNoIndexHeader,
    ensureMatkaEnabled,
    requireAdminAuth,
    validateParams(matkaMarketChartTypeParamsSchema),
    validateBody(matkaChartManualRowBodySchema),
    createV1AdminMarketChartManualRowController({
      matkaService,
      marketContentAdminService,
      marketContentService,
      auditService,
    }),
  );

  router.get(
    '/admin/audit-logs',
    matkaNoIndexHeader,
    ensureMatkaEnabled,
    requireAdminAuth,
    validateQuery(matkaAuditQuerySchema),
    createV1AdminAuditLogsController(auditService),
  );

  return router;
}
