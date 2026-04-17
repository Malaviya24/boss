import { AppError } from '../utils/errors.js';

function parseWithSchema(schema, payload) {
  const result = schema.safeParse(payload ?? {});
  if (result.success) {
    return result.data;
  }

  throw new AppError('Validation failed', {
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    details: result.error.issues,
  });
}

export function validateQuery(schema) {
  return (request, _response, next) => {
    try {
      request.validatedQuery = parseWithSchema(schema, request.query);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateParams(schema) {
  return (request, _response, next) => {
    try {
      request.validatedParams = parseWithSchema(schema, request.params);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function validateBody(schema) {
  return (request, _response, next) => {
    try {
      request.validatedBody = parseWithSchema(schema, request.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}
