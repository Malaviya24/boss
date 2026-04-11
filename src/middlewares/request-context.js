import { randomUUID } from 'node:crypto';

export function requestContextMiddleware(request, response, next) {
  const requestId = request.get('x-request-id') || randomUUID();
  request.requestId = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}
