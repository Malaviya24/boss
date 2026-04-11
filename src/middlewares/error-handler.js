import { ZodError } from 'zod';
import { errorResponse } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

export function notFoundHandler(_request, response) {
  response.status(404).json(errorResponse('Resource not found', 'NOT_FOUND'));
}

export function errorHandler(error, request, response, _next) {
  const requestId = request.requestId;

  if (error instanceof ZodError) {
    response.status(400).json(
      errorResponse('Validation failed', 'VALIDATION_ERROR', {
        requestId,
        issues: error.issues,
      }),
    );
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json(
      errorResponse(error.message, error.code, {
        requestId,
        details: error.details,
      }),
    );
    return;
  }

  response.status(500).json(
    errorResponse('Internal server error', 'INTERNAL_SERVER_ERROR', {
      requestId,
    }),
  );
}
