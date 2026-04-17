import { successResponse } from '../utils/response.js';

export function createV1AdminAuditLogsController(auditService) {
  return async (request, response, next) => {
    try {
      const limit = request.validatedQuery.limit ?? 100;
      const logs = await auditService.list({ limit });
      response.json(successResponse(logs, 'Fetched admin audit logs'));
    } catch (error) {
      next(error);
    }
  };
}
