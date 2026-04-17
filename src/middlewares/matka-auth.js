import { AppError } from '../utils/errors.js';

function parseBearerToken(authorizationHeader = '') {
  const raw = String(authorizationHeader ?? '').trim();
  if (!raw.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return raw.slice(7).trim();
}

export function createMatkaEnabledGuard(matkaService) {
  return (_request, _response, next) => {
    if (!matkaService?.enabled) {
      next(
        new AppError('Matka module is disabled', {
          statusCode: 503,
          code: 'MATKA_DISABLED',
        }),
      );
      return;
    }
    next();
  };
}

export function createMatkaAdminAuthMiddleware(matkaAuthService) {
  return (request, _response, next) => {
    const token = parseBearerToken(request.get('authorization'));
    const admin = matkaAuthService.verifyToken(token);
    request.adminUser = admin;
    next();
  };
}

export function matkaNoIndexHeader(_request, response, next) {
  response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
}
