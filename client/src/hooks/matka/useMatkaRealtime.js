import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

function normalizeUrl(value = '') {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, '');
  }

  return '';
}

function resolveSocketUrl() {
  const fromSocketEnv = normalizeUrl(import.meta.env.VITE_SOCKET_URL ?? '');
  if (fromSocketEnv) {
    return fromSocketEnv;
  }

  if (typeof window === 'undefined') {
    return '';
  }

  const hostname = String(window.location.hostname || '').toLowerCase();
  if (LOCAL_HOSTNAMES.has(hostname)) {
    return '';
  }

  return '';
}

function resolveTransports() {
  const raw = String(import.meta.env.VITE_SOCKET_TRANSPORTS ?? 'polling');
  const values = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item === 'polling' || item === 'websocket');

  return values.length > 0 ? values : ['polling'];
}

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

    const socketUrl = resolveSocketUrl();
    if (!socketUrl) {
      return undefined;
    }

    const socket = io(socketUrl, {
      autoConnect: true,
      transports: resolveTransports(),
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
