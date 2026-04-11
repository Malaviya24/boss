import { ZodError } from 'zod';
import { errorResponse } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(_request, response) {
  response.status(404).json(errorResponse('Resource not found', 'NOT_FOUND'));
}

export function errorHandler(error, request, response, _next) {
  const requestId = request.requestId;
  const isProduction = process.env.NODE_ENV === 'production';

  if (error instanceof ZodError) {
    const details = isProduction
      ? {
          requestId,
          issueCount: error.issues.length,
        }
      : {
          requestId,
          issues: error.issues,
        };

    response.status(400).json(
      errorResponse('Validation failed', 'VALIDATION_ERROR', details),
    );
    return;
  }

  if (error instanceof AppError) {
    const details = {
      requestId,
      ...(isProduction ? {} : { details: error.details }),
    };

    response.status(error.statusCode).json(
      errorResponse(error.message, error.code, details),
    );
    return;
  }

  response.status(500).json(
    errorResponse('Internal server error', 'INTERNAL_SERVER_ERROR', {
      requestId,
    }),
  );
}
