import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearMarketContentCache,
  getMarketContent,
  getMarketLiveRecord,
} from '../../services/content/content-api.js';

const LIVE_REFRESH_MS = Number.parseInt(import.meta.env.VITE_MARKET_LIVE_REFRESH_MS ?? '6000', 10);
const CONTENT_RETRY_MS = Number.parseInt(import.meta.env.VITE_MARKET_CONTENT_RETRY_MS ?? '6000', 10);

function isAbortError(error) {
  return error?.name === 'AbortError';
}

export function useMarketContent({ type, slug }) {
  const [content, setContent] = useState(null);
  const [liveRecord, setLiveRecord] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [errorStatus, setErrorStatus] = useState(null);

  const abortRef = useRef(null);
  const liveAbortRef = useRef(null);
  const liveTimerRef = useRef(null);
  const retryTimerRef = useRef(null);
  const liveRequestInFlightRef = useRef(false);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async ({ force = false } = {}) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (isMountedRef.current) {
        setStatus('loading');
        setError('');
        setErrorCode('');
        setErrorStatus(null);
      }

      try {
        const marketPayload = await getMarketContent({
          type,
          slug,
          force,
          signal: controller.signal,
        });

        if (controller.signal.aborted || !isMountedRef.current) {
          return;
        }

        setContent(marketPayload);
        setStatus('ready');

        void getMarketLiveRecord({
          slug,
          signal: controller.signal,
        })
          .then((livePayload) => {
            if (!controller.signal.aborted && isMountedRef.current && livePayload) {
              setLiveRecord(livePayload);
            }
          })
          .catch(() => {
            // Keep previous live data.
          });
      } catch (requestError) {
        if (isAbortError(requestError)) {
          return;
        }
        if (isMountedRef.current) {
          setError(requestError.message || 'Unable to load market content');
          setErrorCode(requestError.code || '');
          setErrorStatus(requestError.status ?? null);
          setStatus('error');
        }
      }
    },
    [slug, type],
  );

  useEffect(() => {
    void load();

    return () => {
      abortRef.current?.abort();
      liveAbortRef.current?.abort();
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [load]);

  useEffect(() => {
    const intervalMs =
      Number.isFinite(LIVE_REFRESH_MS) && LIVE_REFRESH_MS >= 3000 ? LIVE_REFRESH_MS : 6000;
    let cancelled = false;

    const run = () => {
      liveTimerRef.current = window.setTimeout(async () => {
        if (liveRequestInFlightRef.current) {
          if (!cancelled) {
            run();
          }
          return;
        }

        liveAbortRef.current?.abort();
        const controller = new AbortController();
        liveAbortRef.current = controller;
        liveRequestInFlightRef.current = true;
        try {
          const payload = await getMarketLiveRecord({
            slug,
            signal: controller.signal,
          });
          if (!controller.signal.aborted && isMountedRef.current && payload) {
            setLiveRecord(payload);
          }
        } catch {
          // Keep previous live data.
        } finally {
          liveRequestInFlightRef.current = false;
          if (!cancelled) {
            run();
          }
        }
      }, intervalMs);
    };

    run();
    return () => {
      cancelled = true;
      if (liveTimerRef.current) {
        window.clearTimeout(liveTimerRef.current);
        liveTimerRef.current = null;
      }
      liveAbortRef.current?.abort();
      liveAbortRef.current = null;
      liveRequestInFlightRef.current = false;
    };
  }, [slug]);

  useEffect(() => {
    if (status !== 'error') {
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      return;
    }

    const retryDelayMs =
      Number.isFinite(CONTENT_RETRY_MS) && CONTENT_RETRY_MS >= 3000 ? CONTENT_RETRY_MS : 6000;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      void load({ force: true });
    }, retryDelayMs);

    return () => {
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [load, status]);

  const refresh = useCallback(() => {
    liveAbortRef.current?.abort();
    const controller = new AbortController();
    liveAbortRef.current = controller;

    void getMarketLiveRecord({
      slug,
      signal: controller.signal,
    })
      .then((payload) => {
        if (!controller.signal.aborted && isMountedRef.current && payload) {
          setLiveRecord(payload);
          return;
        }

        clearMarketContentCache();
        void load({ force: true });
      })
      .catch(() => {
        clearMarketContentCache();
        void load({ force: true });
      });
  }, [load, slug]);

  return {
    content,
    liveRecord,
    status,
    error,
    errorCode,
    errorStatus,
    refresh,
  };
}
