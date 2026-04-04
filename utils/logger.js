export function createLogger(scope) {
  return {
    info(event, details = {}) {
      log('INFO', scope, event, details);
    },
    warn(event, details = {}) {
      log('WARN', scope, event, details);
    },
    error(event, details = {}) {
      log('ERROR', scope, event, details);
    },
  };
}

function log(level, scope, event, details) {
  const payload = {
    level,
    scope,
    event,
    timestamp: new Date().toISOString(),
    ...details,
  };

  const writer = level === 'ERROR' ? console.error : console.log;
  writer(JSON.stringify(payload));
}
