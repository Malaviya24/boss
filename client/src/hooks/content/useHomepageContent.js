import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '../useSocket.js';
import {
  getHomepageContent,
  invalidateHomepageContentCache,
} from '../../services/content/content-api.js';

const realtimeMode = import.meta.env.VITE_REALTIME_MODE ?? 'poll';
const configuredPollInterval = Number.parseInt(
  import.meta.env.VITE_POLL_INTERVAL_MS ?? '5000',
  10,
);
const pollIntervalMs = Number.isFinite(configuredPollInterval)
  ? Math.max(configuredPollInterval, 2000)
  : 5000;

function isAbortError(error) {
  return error?.name === 'AbortError';
}

export function useHomepageContent() {
  const [content, setContent] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const abortRef = useRef(null);
  const inFlightRef = useRef(null);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  const loadContent = useCallback(
    async ({ force = false, preserveConnection = false } = {}) => {
      if (inFlightRef.current && !force) {
        return inFlightRef.current;
      }

      if (force) {
        abortRef.current?.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      const requestPromise = (async () => {
        try {
          const payload = await getHomepageContent({
            force,
            signal: controller.signal,
          });
          if (!mountedRef.current) {
            return;
          }

          setContent(payload);
          setError('');
          setStatus('ready');
          if (!preserveConnection) {
            setConnectionStatus(realtimeMode === 'socket' ? 'connected' : 'polling');
          }
        } catch (requestError) {
          if (!mountedRef.current || isAbortError(requestError)) {
            return;
          }

          setError(requestError.message || 'Unable to load homepage content');
          setStatus('error');
          setConnectionStatus('error');
        } finally {
          if (inFlightRef.current === requestPromise) {
            inFlightRef.current = null;
          }

          if (abortRef.current === controller) {
            abortRef.current = null;
          }
        }
      })();

      inFlightRef.current = requestPromise;
      return requestPromise;
    },
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    setStatus('loading');
    void loadContent();

    if (realtimeMode !== 'socket') {
      const tick = () => {
        timerRef.current = window.setTimeout(async () => {
          await loadContent({ preserveConnection: true });
          if (mountedRef.current) {
            tick();
          }
        }, pollIntervalMs);
      };
      tick();
    }

    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      abortRef.current?.abort();
      inFlightRef.current = null;
    };
  }, [loadContent]);

  useSocket({
    enabled: realtimeMode === 'socket',
    onStatus: setConnectionStatus,
    onHomepageUpdate: () => {
      invalidateHomepageContentCache();
      void loadContent({ force: true, preserveConnection: true });
    },
  });

  return {
    content,
    status,
    error,
    connectionStatus,
    refresh: () => loadContent({ force: true }),
  };
}
