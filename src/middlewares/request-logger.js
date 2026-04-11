export function createRequestLoggerMiddleware(logger) {
  return (request, response, next) => {
    const startedAt = Date.now();

    response.on('finish', () => {
      logger.info('http_request', {
        requestId: request.requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
        ip: request.ip,
      });
    });

    next();
  };
}
