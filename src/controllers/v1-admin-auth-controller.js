import { successResponse } from '../utils/response.js';

export function createV1AdminLoginController(matkaAuthService, auditService) {
  return async (request, response, next) => {
    try {
      const result = await matkaAuthService.login(request.validatedBody);

      await auditService.log({
        adminUser: result.username,
        action: 'admin_login',
        entityType: 'auth',
        entityId: result.username,
        before: null,
        after: { success: true },
        ip: request.ip,
        userAgent: request.get('user-agent') ?? '',
      });

      response.json(successResponse(result, 'Admin login successful'));
    } catch (error) {
      next(error);
    }
  };
}

export function createV1AdminLogoutController() {
  return (_request, response) => {
    response.json(
      successResponse(
        {
          ok: true,
        },
        'Admin logout successful',
      ),
    );
  };
}

export function createV1AdminMeController() {
  return (request, response) => {
    response.json(
      successResponse(
        {
          username: request.adminUser?.username ?? '',
        },
        'Fetched admin profile',
      ),
    );
  };
}
