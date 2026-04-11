import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSocket } from '../hooks/useSocket.js';
import { fetchHomepage, invalidateHomepageCache } from '../services/api.js';

const realtimeMode = import.meta.env.VITE_REALTIME_MODE ?? 'poll';
const configuredPollInterval = Number.parseInt(
  import.meta.env.VITE_POLL_INTERVAL_MS ?? '5000',
  10,
);
const pollIntervalMs = Number.isFinite(configuredPollInterval)
  ? Math.max(configuredPollInterval, 2000)
  : 5000;
const ROTATING_PHRASES = [
  'Fix Ank',
  'Kalyan Fix',
  'Milan Fix',
  'Fix open',
  'Fix close',
  'Fix jodi',
];

function parseMarketPath(value = '') {
  const match = String(value)
    .trim()
    .toLowerCase()
    .match(/^\/market\/(jodi|panel)\/([a-z0-9-]+)(?:\.php)?\/?$/i);

  if (!match) {
    return null;
  }

  return {
    type: match[1] === 'panel' ? 'panel' : 'jodi',
    slug: String(match[2]),
  };
}

function areSectionMapsEqual(currentValue, nextValue) {
  const current = currentValue ?? {};
  const next = nextValue ?? {};
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);

  if (currentKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of currentKeys) {
    if (current[key] !== next[key]) {
      return false;
    }
  }

  return true;
}

function getTemplateSignature(template) {
  if (!template) {
    return '';
  }

  const fragmentSize = Array.isArray(template.fragments)
    ? template.fragments.reduce((total, fragment) => total + String(fragment ?? '').length, 0)
    : 0;
  const sectionOrder = Array.isArray(template.sectionOrder) ? template.sectionOrder.join('|') : '';

  return `${sectionOrder}::${fragmentSize}`;
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

export default function HomePage() {
  const [template, setTemplate] = useState(null);
  const [htmlBySectionId, setHtmlBySectionId] = useState({});
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  const isMountedRef = useRef(true);
  const isRequestInFlightRef = useRef(false);
  const pollingTimerRef = useRef(null);
  const requestAbortRef = useRef(null);
  const prefetchedMarketLinksRef = useRef(new Set());
  const templateSignatureRef = useRef('');
  const sectionsRef = useRef({});
  const snapshotKeyRef = useRef('');

  const applyHomepagePayload = useCallback((payload) => {
    if (!payload) {
      return;
    }

    const nextTemplate = payload.template ?? null;
    const nextSections = payload.htmlBySectionId ?? {};
    const nextSnapshotKey = `${payload.updatedAt ?? ''}|${payload.lastScrapeAt ?? ''}|${
      payload.lastMarketUpdateAt ?? ''
    }`;

    if (nextSnapshotKey) {
      snapshotKeyRef.current = nextSnapshotKey;
    }

    const nextTemplateSignature = getTemplateSignature(nextTemplate);
    if (nextTemplate && (!templateSignatureRef.current || nextTemplateSignature !== templateSignatureRef.current)) {
      templateSignatureRef.current = nextTemplateSignature;
      setTemplate(nextTemplate);
    }

    if (!areSectionMapsEqual(sectionsRef.current, nextSections)) {
      sectionsRef.current = nextSections;
      setHtmlBySectionId(nextSections);
    }
  }, []);

  const loadHomepage = useCallback(
    async ({ preserveConnection = false, force = false } = {}) => {
      if (isRequestInFlightRef.current) {
        return;
      }

      isRequestInFlightRef.current = true;
      const abortController = new AbortController();
      requestAbortRef.current = abortController;

      try {
        const payload = await fetchHomepage({
          force,
          signal: abortController.signal,
        });
        if (!isMountedRef.current) {
          return;
        }

        applyHomepagePayload(payload);

        if (!preserveConnection) {
          setConnectionStatus(realtimeMode === 'socket' ? 'connected' : 'polling');
        }
      } catch (error) {
        if (!isAbortError(error) && isMountedRef.current) {
          setConnectionStatus('error');
        }
      } finally {
        isRequestInFlightRef.current = false;
      }
    },
    [applyHomepagePayload],
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const rotatingElement = document.getElementById('rotatingText');
      if (!rotatingElement) {
        return;
      }

      const currentIndex = Number(rotatingElement.dataset.index ?? '0');
      const nextIndex = (currentIndex + 1) % ROTATING_PHRASES.length;
      rotatingElement.textContent = ROTATING_PHRASES[nextIndex];
      rotatingElement.dataset.index = String(nextIndex);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const savedScrollPosition = window.localStorage.getItem('scrollPosition');
    if (savedScrollPosition !== null) {
      window.scrollTo(0, Number.parseInt(savedScrollPosition, 10));
      window.localStorage.removeItem('scrollPosition');
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadHomepage();

    if (realtimeMode !== 'socket') {
      const schedulePolling = () => {
        pollingTimerRef.current = window.setTimeout(async () => {
          await loadHomepage({ preserveConnection: true });
          if (isMountedRef.current) {
            schedulePolling();
          }
        }, pollIntervalMs);
      };
      schedulePolling();
    }

    return () => {
      isMountedRef.current = false;
      if (pollingTimerRef.current) {
        window.clearTimeout(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
      if (requestAbortRef.current) {
        requestAbortRef.current.abort();
      }
    };
  }, [loadHomepage]);

  useSocket({
    enabled: realtimeMode === 'socket',
    onStatus: setConnectionStatus,
    onHomepageUpdate: (payload) => {
      if (!payload?.htmlBySectionId) {
        return;
      }

      const nextSnapshotKey = `${payload.updatedAt ?? ''}|${payload.lastScrapeAt ?? ''}|${
        payload.lastMarketUpdateAt ?? ''
      }`;
      if (nextSnapshotKey && nextSnapshotKey !== snapshotKeyRef.current) {
        snapshotKeyRef.current = nextSnapshotKey;
        invalidateHomepageCache();
      }

      if (!areSectionMapsEqual(sectionsRef.current, payload.htmlBySectionId)) {
        sectionsRef.current = payload.htmlBySectionId;
        setHtmlBySectionId(payload.htmlBySectionId);
      }
    },
  });

  const content = useMemo(() => {
    if (!template) {
      return null;
    }

    const nodes = [];
    template.fragments.forEach((fragment, index) => {
      if (fragment) {
        nodes.push(<HtmlFragment key={`fragment-${index}`} html={fragment} />);
      }

      const sectionId = template.sectionOrder[index];
      if (sectionId) {
        nodes.push(
          <HtmlFragment
            key={`section-${sectionId}`}
            html={
              htmlBySectionId[sectionId] ?? template.fallbackHtmlBySectionId?.[sectionId] ?? ''
            }
          />,
        );
      }
    });

    return nodes;
  }, [htmlBySectionId, template]);

  const handleClickCapture = useCallback((event) => {
    const refreshButton = event.target.closest('[data-refresh-button="true"]');
    if (!refreshButton) {
      return;
    }

    event.preventDefault();

    if (refreshButton.dataset.saveScroll === 'true') {
      window.localStorage.setItem('scrollPosition', String(window.scrollY));
    }

    window.location.reload();
  }, []);

  const prefetchMarketLink = useCallback((url) => {
    if (!url || prefetchedMarketLinksRef.current.has(url)) {
      return;
    }

    prefetchedMarketLinksRef.current.add(url);
    const parsed = parseMarketPath(url);
    if (!parsed) {
      return;
    }

    import('../services/market/market-api.js')
      .then(({ fetchMarketTemplate }) =>
        fetchMarketTemplate({
          type: parsed.type,
          slug: parsed.slug,
          offset: 0,
          limit: 180,
        }),
      )
      .catch(() => undefined);
  }, []);

  const handlePointerPrefetch = useCallback((event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) {
      return;
    }

    const href = anchor.getAttribute('href') ?? '';
    if (!href.startsWith('/market/')) {
      return;
    }

    prefetchMarketLink(href);
  }, [prefetchMarketLink]);

  if (!template) {
    return (
      <div className="clone-loading">
        <img
          src="/img/spinner.png"
          alt="Loading"
          width="48"
          height="48"
          loading="eager"
          decoding="async"
          style={{ marginBottom: 12 }}
        />
        <div>{connectionStatus === 'error' ? 'Unable to load homepage.' : 'Loading DPBOSS...'}</div>
      </div>
    );
  }

  return (
    <div
      className="clone-app"
      onClickCapture={handleClickCapture}
      onMouseOverCapture={handlePointerPrefetch}
      onTouchStartCapture={handlePointerPrefetch}
    >
      {content}
    </div>
  );
}

const HtmlFragment = memo(function HtmlFragment({ html }) {
  return <div className="html-fragment" dangerouslySetInnerHTML={{ __html: html }} />;
});
