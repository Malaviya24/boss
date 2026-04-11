import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

export function buildSecurityMiddleware(env, logger) {
  const apiLimiter = rateLimit({
    windowMs: env.apiRateLimitWindowMs,
    max: env.apiRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const strictLimiter = rateLimit({
    windowMs: env.apiRateLimitWindowMs,
    max: env.strictRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const corsMiddleware = cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin, env.corsOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
  });

  const csrfGuard = (request, response, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      next();
      return;
    }

    if (!env.csrfToken) {
      logger.warn('csrf_token_missing_for_unsafe_method', {
        method: request.method,
        path: request.path,
      });
      response.status(403).json({ error: 'CSRF protection token not configured' });
      return;
    }

    const token = request.get('x-csrf-token');
    if (token !== env.csrfToken) {
      response.status(403).json({ error: 'Invalid CSRF token' });
      return;
    }

    next();
  };

  const securityHeaders = helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  const customHeaders = (_request, response, next) => {
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

    if (env.isProduction) {
      response.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }

    next();
  };

  return {
    compressionMiddleware: compression(),
    corsMiddleware,
    securityHeaders,
    customHeaders,
    apiLimiter,
    strictLimiter,
    csrfGuard,
  };
}
