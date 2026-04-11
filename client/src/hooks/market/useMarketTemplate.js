import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchMarketTemplate } from '../../services/market/market-api.js';

export function useMarketTemplate({ type, slug }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [errorStatus, setErrorStatus] = useState(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const abortRef = useRef(null);

  const baseParams = useMemo(
    () => ({
      type,
      slug,
      limit: 180,
    }),
    [slug, type],
  );

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('loading');
    setError('');
    setErrorCode('');
    setErrorStatus(null);
    setData(null);

    fetchMarketTemplate({
      ...baseParams,
      offset: 0,
      signal: controller.signal,
    })
      .then((payload) => {
        setData(payload);
        setStatus('ready');
      })
      .catch((requestError) => {
        if (requestError?.name === 'AbortError') {
          return;
        }
        setError(requestError.message || 'Unable to load market page');
        setErrorCode(requestError.code || '');
        setErrorStatus(requestError.status ?? null);
        setStatus('error');
      });

    return () => {
      controller.abort();
    };
  }, [baseParams]);

  const loadMore = useCallback(async () => {
    if (!data?.table?.hasMore || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const nextPayload = await fetchMarketTemplate({
        ...baseParams,
        offset: data.table.offset + data.table.rows.length,
        limit: data.table.limit,
      });

      setData((currentData) => {
        if (!currentData?.table) {
          return nextPayload;
        }

        return {
          ...currentData,
          table: {
            ...nextPayload.table,
            rows: [...currentData.table.rows, ...nextPayload.table.rows],
            offset: currentData.table.offset,
            totalRows: nextPayload.table.totalRows,
            hasMore: nextPayload.table.hasMore,
          },
        };
      });
    } catch (requestError) {
      setError(requestError.message || 'Unable to load more rows');
    } finally {
      setIsLoadingMore(false);
    }
  }, [baseParams, data, isLoadingMore]);

  return {
    data,
    status,
    error,
    errorCode,
    errorStatus,
    isLoadingMore,
    loadMore,
  };
}
