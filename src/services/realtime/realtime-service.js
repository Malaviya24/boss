import { Server } from 'socket.io';

export function createRealtimeService({ logger, corsOrigins, heartbeatMs = 15000, enableHeartbeat = true }) {
  let io = null;
  const sseClients = new Set();
  let heartbeatInterval = null;

  function initialize(server) {
    io = new Server(server, {
      cors: {
        origin: corsOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    io.on('connection', (socket) => {
      logger.info('socket_connected', { socketId: socket.id });
      socket.on('disconnect', (reason) => {
        logger.info('socket_disconnected', { socketId: socket.id, reason });
      });
    });

    if (enableHeartbeat && heartbeatMs > 0) {
      heartbeatInterval = setInterval(() => {
        for (const response of sseClients) {
          response.write(': heartbeat\n\n');
        }
      }, heartbeatMs);
    }
  }

  function registerSseClient(request, response) {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders?.();

    response.write(`event: connected\ndata: ${JSON.stringify({ requestId: request.requestId })}\n\n`);
    sseClients.add(response);

    request.on('close', () => {
      sseClients.delete(response);
    });
  }

  function emit(eventName, payload) {
    if (io) {
      io.emit(eventName, payload);
    }

    const encoded = JSON.stringify(payload ?? {});
    for (const response of sseClients) {
      response.write(`event: ${eventName}\ndata: ${encoded}\n\n`);
    }
  }

  function close() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }

    for (const response of sseClients) {
      response.end();
    }
    sseClients.clear();

    if (io) {
      io.close();
      io = null;
    }
  }

  return {
    initialize,
    registerSseClient,
    emit,
    close,
  };
}
