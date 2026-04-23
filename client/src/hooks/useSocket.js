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

    const socketUrl = resolveSocketUrl();
    if (!socketUrl) {
      handlersRef.current.onStatus?.('disabled');
      return undefined;
    }

    const socket = io(socketUrl, {
      autoConnect: true,
      transports: resolveTransports(),
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
