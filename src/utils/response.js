export function successResponse(data, message = 'OK', meta) {
  const payload = {
    success: true,
    data,
    message,
  };

  if (meta && typeof meta === 'object') {
    payload.meta = meta;
  }

  return payload;
}

export function errorResponse(message = 'Request failed', code = 'REQUEST_FAILED', details) {
  const payload = {
    success: false,
    data: null,
    message,
    code,
  };

  if (details !== undefined) {
    payload.details = details;
  }

  return payload;
}
