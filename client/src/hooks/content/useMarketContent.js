import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clearMarketContentCache,
  getMarketContent,
  getMarketLiveRecord,
} from '../../services/content/content-api.js';

const LIVE_REFRESH_MS = Number.parseInt(import.meta.env.VITE_MARKET_LIVE_REFRESH_MS ?? '6000', 10);

function isAbortError(error) {
  return error?.name === 'AbortError';
}

function patchLiveNodes(nodes = [], { marketType, liveName, liveValue }) {
  let mutated = false;

  const nextNodes = nodes.map((node) => {
    if (!node || node.type !== 'element') {
      return node;
    }

    let nextChildren = node.children ?? [];
    if (nextChildren.length > 0) {
      const patchedChildren = patchLiveNodes(nextChildren, { marketType, liveName, liveValue });
      if (patchedChildren !== nextChildren) {
        nextChildren = patchedChildren;
        mutated = true;
      }
    }

    const attrs = node.attrs ?? {};
    if (attrs['data-live-result-name'] === 'true' && liveName) {
      mutated = true;
      return {
        ...node,
        children: [{ type: 'text', text: liveName }],
      };
    }

    if (attrs['data-live-result-value'] === 'true' && liveValue) {
      mutated = true;
      return {
        ...node,
        children: [{ type: 'text', text: liveValue }],
      };
    }

    if (nextChildren !== node.children) {
      return {
        ...node,
        children: nextChildren,
      };
    }

    return node;
  });

  return mutated ? nextNodes : nodes;
}

function resolveLiveValue(record, marketType) {
  if (!record?.current) {
    return '';
  }

  return (
    record.current[marketType] ||
    record.current.number ||
    record.current.jodi ||
    record.current.panel ||
    ''
  );
}

export function useMarketContent({ type, slug }) {
  const [content, setContent] = useState(null);
  const [liveRecord, setLiveRecord] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [errorStatus, setErrorStatus] = useState(null);
  const abortRef = useRef(null);
  const liveTimerRef = useRef(null);

  const load = useCallback(
    async ({ force = false } = {}) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus((currentStatus) => (currentStatus === 'ready' ? currentStatus : 'loading'));
      setError('');
      setErrorCode('');
      setErrorStatus(null);

      try {
        const [marketPayload, livePayload] = await Promise.all([
          getMarketContent({
            type,
            slug,
            force,
            signal: controller.signal,
          }),
          getMarketLiveRecord({
            slug,
            signal: controller.signal,
          }),
        ]);

        setContent(marketPayload);
        setLiveRecord(livePayload);
        setStatus('ready');
      } catch (requestError) {
        if (isAbortError(requestError)) {
          return;
        }
        setError(requestError.message || 'Unable to load market content');
        setErrorCode(requestError.code || '');
        setErrorStatus(requestError.status ?? null);
        setStatus('error');
      }
    },
    [slug, type],
  );

  useEffect(() => {
    void load();
    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    const intervalMs =
      Number.isFinite(LIVE_REFRESH_MS) && LIVE_REFRESH_MS >= 3000 ? LIVE_REFRESH_MS : 6000;

    const run = () => {
      liveTimerRef.current = window.setTimeout(async () => {
        const controller = new AbortController();
        try {
          const livePayload = await getMarketLiveRecord({
            slug,
            signal: controller.signal,
          });
          setLiveRecord(livePayload);
        } catch {
          // Keep previous value if refresh fails.
        } finally {
          run();
        }
      }, intervalMs);
    };

    run();
    return () => {
      if (liveTimerRef.current) {
        window.clearTimeout(liveTimerRef.current);
        liveTimerRef.current = null;
      }
    };
  }, [slug]);

  const renderedBodyNodes = useMemo(() => {
    if (!content?.bodyNodes) {
      return [];
    }

    const liveName = String(liveRecord?.name ?? '').trim();
    const liveValue = String(resolveLiveValue(liveRecord, type) ?? '').trim();
    if (!liveName && !liveValue) {
      return content.bodyNodes;
    }

    return patchLiveNodes(content.bodyNodes, {
      marketType: type,
      liveName,
      liveValue,
    });
  }, [content, liveRecord, type]);

  return {
    content,
    renderedBodyNodes,
    status,
    error,
    errorCode,
    errorStatus,
    refresh: () => {
      clearMarketContentCache();
      void load({ force: true });
    },
  };
}

