import { Server } from 'socket.io';

let io;
let socketLogger;

export function initializeSocketServer(server, { origin, logger }) {
  socketLogger = logger;
  io = new Server(server, {
    cors: {
      origin: origin.split(',').map((value) => value.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    socketLogger.info('socket_connected', { socketId: socket.id });
    socket.on('disconnect', (reason) => {
      socketLogger.info('socket_disconnected', {
        socketId: socket.id,
        reason,
      });
    });
  });

  return io;
}

export function emitUpdateAll(payload) {
  if (!io) {
    return;
  }

  io.emit('update-all', payload);
}

export function emitHomepageUpdate(payload) {
  if (!io) {
    return;
  }

  io.emit('homepage-update', payload);
}

export function closeSocketServer() {
  if (!io) {
    return;
  }

  io.close();
  io = null;
}
