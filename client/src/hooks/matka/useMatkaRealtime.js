import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const socketUrl = import.meta.env.VITE_SOCKET_URL?.trim() || undefined;

export function useMatkaRealtime({ enabled, onMarketsUpdated, onMarketResultUpdated }) {
  const handlersRef = useRef({
    onMarketsUpdated,
    onMarketResultUpdated,
  });

  handlersRef.current = {
    onMarketsUpdated,
    onMarketResultUpdated,
  };

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const socket = io(socketUrl ?? '/', {
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('matka:markets_updated', (payload) => {
      handlersRef.current.onMarketsUpdated?.(payload);
    });

    socket.on('matka:market_result_updated', (payload) => {
      handlersRef.current.onMarketResultUpdated?.(payload);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [enabled]);
}
