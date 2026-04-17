import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { AppError } from '../../utils/errors.js';

const JWT_ISSUER = 'dpboss-api';
const JWT_AUDIENCE = 'dpboss-admin';
const JWT_ALGORITHM = 'HS256';

function safeEqual(left = '', right = '') {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

export function createMatkaAuthService({ env }) {
  function ensureAuthConfigured() {
    if (!env.adminUsername || !env.adminPasswordHash || !env.jwtSecret) {
      throw new AppError('Admin auth is not configured', {
        statusCode: 503,
        code: 'ADMIN_AUTH_NOT_CONFIGURED',
      });
    }
  }

  async function login({ username, password }) {
    ensureAuthConfigured();

    const normalizedUsername = String(username ?? '').trim();
    const normalizedPassword = String(password ?? '');

    const usernameMatches = safeEqual(normalizedUsername, env.adminUsername);
    const passwordMatches = await bcrypt.compare(normalizedPassword, env.adminPasswordHash);

    if (!usernameMatches || !passwordMatches) {
      throw new AppError('Invalid credentials', {
        statusCode: 401,
        code: 'ADMIN_LOGIN_FAILED',
      });
    }

    const token = jwt.sign(
      {
        sub: 'admin',
        username: env.adminUsername,
      },
      env.jwtSecret,
      {
        expiresIn: env.jwtExpiresIn,
        algorithm: JWT_ALGORITHM,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      },
    );

    return {
      token,
      tokenType: 'Bearer',
      expiresIn: env.jwtExpiresIn,
      username: env.adminUsername,
    };
  }

  function verifyToken(rawToken) {
    ensureAuthConfigured();
    if (!rawToken) {
      throw new AppError('Missing auth token', {
        statusCode: 401,
        code: 'AUTH_TOKEN_MISSING',
      });
    }

    try {
      const payload = jwt.verify(rawToken, env.jwtSecret, {
        algorithms: [JWT_ALGORITHM],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      if (payload?.sub !== 'admin' || payload?.username !== env.adminUsername) {
        throw new AppError('Invalid auth token', {
          statusCode: 401,
          code: 'AUTH_TOKEN_INVALID',
        });
      }

      return {
        username: String(payload.username),
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Invalid auth token', {
        statusCode: 401,
        code: 'AUTH_TOKEN_INVALID',
      });
    }
  }

  return {
    enabled: Boolean(env.adminUsername && env.adminPasswordHash && env.jwtSecret),
    login,
    verifyToken,
  };
}
