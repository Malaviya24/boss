export function validateQuery(schema) {
  return (request, _response, next) => {
    request.validatedQuery = schema.parse(request.query ?? {});
    next();
  };
}

export function validateParams(schema) {
  return (request, _response, next) => {
    request.validatedParams = schema.parse(request.params ?? {});
    next();
  };
}
