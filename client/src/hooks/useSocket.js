import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const socketUrl = import.meta.env.VITE_SOCKET_URL?.trim() || undefined;

export function useSocket({
  enabled,
  onStatus,
  onUpdateAll,
  onHomepageUpdate,
  onUpdateNumber,
  onUpdateJodi,
  onUpdatePanel,
}) {
  const handlersRef = useRef({
    onStatus,
    onUpdateAll,
    onHomepageUpdate,
    onUpdateNumber,
    onUpdateJodi,
    onUpdatePanel,
  });

  handlersRef.current = {
    onStatus,
    onUpdateAll,
    onHomepageUpdate,
    onUpdateNumber,
    onUpdateJodi,
    onUpdatePanel,
  };

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const socket = io(socketUrl ?? '/', {
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => handlersRef.current.onStatus?.('connected'));
    socket.on('disconnect', () => handlersRef.current.onStatus?.('disconnected'));
    socket.on('update-all', (payload) => handlersRef.current.onUpdateAll?.(payload));
    socket.on('homepage-update', (payload) =>
      handlersRef.current.onHomepageUpdate?.(payload),
    );
    socket.on('update-number', (payload) =>
      handlersRef.current.onUpdateNumber?.(payload),
    );
    socket.on('update-jodi', (payload) => handlersRef.current.onUpdateJodi?.(payload));
    socket.on('update-panel', (payload) =>
      handlersRef.current.onUpdatePanel?.(payload),
    );

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [enabled]);
}
