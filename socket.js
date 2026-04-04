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

function emit(eventName, payload) {
  if (!io) {
    return;
  }

  io.emit(eventName, payload);
}

export function emitUpdateAll(payload) {
  emit('update-all', payload);
}

export function emitUpdateNumber(payload) {
  emit('update-number', payload);
}

export function emitUpdateJodi(payload) {
  emit('update-jodi', payload);
}

export function emitUpdatePanel(payload) {
  emit('update-panel', payload);
}

export function emitHomepageUpdate(payload) {
  emit('homepage-update', payload);
}

export function closeSocketServer() {
  if (!io) {
    return;
  }

  io.close();
  io = null;
}
