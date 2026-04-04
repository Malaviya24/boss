import { useEffect, useMemo, useRef, useState } from 'react';
import MarketExplorer from '../components/MarketExplorer.jsx';
import { useSocket } from '../hooks/useSocket.js';
import { fetchHomepage } from '../services/api.js';

const realtimeMode = import.meta.env.VITE_REALTIME_MODE ?? 'poll';
const pollIntervalMs = Number.parseInt(import.meta.env.VITE_POLL_INTERVAL_MS ?? '5000', 10);
const FLASH_WINDOW_MS = 3500;
const ROTATING_PHRASES = [
  'Fix Ank',
  'Kalyan Fix',
  'Milan Fix',
  'Fix open',
  'Fix close',
  'Fix jodi',
];

function indexMarkets(markets) {
  return new Map(markets.map((market) => [market.key, market]));
}

function getChangedFields(previous, next) {
  if (!previous) {
    return ['number', 'jodi', 'panel'];
  }

  return ['number', 'jodi', 'panel'].filter(
    (field) => previous.current?.[field] !== next.current?.[field],
  );
}

function computeRecentChanges(previousMarkets, nextMarkets, fallbackRecords = []) {
  const previousByKey = indexMarkets(previousMarkets);
  const changes = {};

  for (const market of nextMarkets) {
    const explicitFields = market.changed_fields?.length ? market.changed_fields : null;
    const changedFields = explicitFields ?? getChangedFields(previousByKey.get(market.key), market);

    if (changedFields.length > 0) {
      changes[market.key] = {
        fields: changedFields,
        timestamp: Date.now(),
      };
    }
  }

  for (const market of fallbackRecords) {
    if (!market?.key) {
      continue;
    }

    changes[market.key] = {
      fields: market.changed_fields?.length ? market.changed_fields : ['number', 'jodi', 'panel'],
      timestamp: Date.now(),
    };
  }

  return changes;
}

function mergeRecords(currentMarkets, incomingRecords) {
  const next = new Map(currentMarkets.map((market) => [market.key, market]));
  for (const market of incomingRecords) {
    next.set(market.key, market);
  }

  return [...next.values()].sort(
    (left, right) => (left.source_index ?? 0) - (right.source_index ?? 0),
  );
}

export default function HomePage() {
  const [template, setTemplate] = useState(null);
  const [htmlBySectionId, setHtmlBySectionId] = useState({});
  const [markets, setMarkets] = useState([]);
  const [candidateApis, setCandidateApis] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [lastScrapeAt, setLastScrapeAt] = useState(null);
  const [lastMarketUpdateAt, setLastMarketUpdateAt] = useState(null);
  const [recentChanges, setRecentChanges] = useState({});
  const previousMarketsRef = useRef([]);

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
  }, [template]);

  useEffect(() => {
    const savedScrollPosition = window.localStorage.getItem('scrollPosition');
    if (savedScrollPosition !== null) {
      window.scrollTo(0, Number.parseInt(savedScrollPosition, 10));
      window.localStorage.removeItem('scrollPosition');
    }
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRecentChanges((current) => {
        const nextEntries = Object.entries(current).filter(
          ([, value]) => Date.now() - value.timestamp < FLASH_WINDOW_MS,
        );
        return Object.fromEntries(nextEntries);
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  async function loadHomepage({ preserveConnection = false } = {}) {
    const payload = await fetchHomepage();
    setTemplate(payload.template);
    setHtmlBySectionId(payload.htmlBySectionId ?? {});
    setCandidateApis(payload.candidateApis ?? []);
    setUpdatedAt(payload.updatedAt);
    setLastScrapeAt(payload.lastScrapeAt);
    setLastMarketUpdateAt(payload.lastMarketUpdateAt);
    setMarkets((current) => {
      const nextMarkets = payload.markets ?? [];
      const previousMarkets = current.length > 0 ? current : previousMarketsRef.current;
      const nextChanges = computeRecentChanges(previousMarkets, nextMarkets);
      if (Object.keys(nextChanges).length > 0) {
        setRecentChanges((existing) => ({ ...existing, ...nextChanges }));
      }
      previousMarketsRef.current = nextMarkets;
      return nextMarkets;
    });

    if (!preserveConnection) {
      setConnectionStatus(realtimeMode === 'socket' ? 'connected' : 'polling');
    }
  }

  useEffect(() => {
    let isMounted = true;
    let intervalId;

    loadHomepage().catch(() => {
      if (isMounted) {
        setConnectionStatus('error');
      }
    });

    if (realtimeMode !== 'socket') {
      intervalId = window.setInterval(() => {
        loadHomepage({ preserveConnection: true }).catch(() => {
          if (isMounted) {
            setConnectionStatus('error');
          }
        });
      }, pollIntervalMs);
    }

    return () => {
      isMounted = false;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  useSocket({
    enabled: realtimeMode === 'socket',
    onStatus: setConnectionStatus,
    onUpdateAll: (payload) => {
      if (payload.all) {
        const nextChanges = computeRecentChanges(previousMarketsRef.current, payload.all, payload.latest);
        if (Object.keys(nextChanges).length > 0) {
          setRecentChanges((existing) => ({ ...existing, ...nextChanges }));
        }
        previousMarketsRef.current = payload.all;
        setMarkets(payload.all);
      }
      setLastMarketUpdateAt(payload.updatedAt ?? null);
      setLastScrapeAt(payload.lastScrapeAt ?? null);
    },
    onHomepageUpdate: (payload) => {
      if (payload.htmlBySectionId) {
        setHtmlBySectionId(payload.htmlBySectionId);
      }
      if (payload.candidateApis) {
        setCandidateApis(payload.candidateApis);
      }
      if (payload.markets) {
        const nextChanges = computeRecentChanges(previousMarketsRef.current, payload.markets);
        if (Object.keys(nextChanges).length > 0) {
          setRecentChanges((existing) => ({ ...existing, ...nextChanges }));
        }
        previousMarketsRef.current = payload.markets;
        setMarkets(payload.markets);
      }
      setUpdatedAt(payload.updatedAt ?? null);
      setLastScrapeAt(payload.lastScrapeAt ?? null);
      setLastMarketUpdateAt(payload.lastMarketUpdateAt ?? null);
    },
    onUpdateNumber: (payload) => {
      setRecentChanges((existing) => ({
        ...existing,
        ...Object.fromEntries(
          (payload.records ?? []).map((record) => [
            record.key,
            { fields: ['number'], timestamp: Date.now() },
          ]),
        ),
      }));
    },
    onUpdateJodi: (payload) => {
      setRecentChanges((existing) => ({
        ...existing,
        ...Object.fromEntries(
          (payload.records ?? []).map((record) => [
            record.key,
            { fields: ['jodi'], timestamp: Date.now() },
          ]),
        ),
      }));
    },
    onUpdatePanel: (payload) => {
      setRecentChanges((existing) => ({
        ...existing,
        ...Object.fromEntries(
          (payload.records ?? []).map((record) => [
            record.key,
            { fields: ['panel'], timestamp: Date.now() },
          ]),
        ),
      }));
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
      if (!sectionId) {
        return;
      }

      if (sectionId === 'market-explorer') {
        nodes.push(
          <MarketExplorer
            key="market-explorer"
            markets={markets}
            recentChanges={recentChanges}
            connectionStatus={connectionStatus}
            updatedAt={lastMarketUpdateAt || updatedAt}
            lastScrapeAt={lastScrapeAt}
            candidateApis={candidateApis}
          />,
        );
        return;
      }

      nodes.push(
        <HtmlFragment
          key={`section-${sectionId}`}
          html={htmlBySectionId[sectionId] ?? ''}
        />,
      );
    });

    return nodes;
  }, [candidateApis, connectionStatus, htmlBySectionId, lastMarketUpdateAt, lastScrapeAt, markets, recentChanges, template, updatedAt]);

  function handleClickCapture(event) {
    const refreshButton = event.target.closest('[data-refresh-button="true"]');
    if (!refreshButton) {
      return;
    }

    event.preventDefault();

    if (refreshButton.dataset.saveScroll === 'true') {
      window.localStorage.setItem('scrollPosition', String(window.scrollY));
    }

    window.location.reload();
  }

  if (!template) {
    return (
      <div className="clone-loading">
        {connectionStatus === 'error' ? 'Unable to load homepage.' : 'Loading DPBOSS...'}
      </div>
    );
  }

  return (
    <div className="clone-app" onClickCapture={handleClickCapture}>
      {content}
    </div>
  );
}

function HtmlFragment({ html }) {
  return <div className="html-fragment" dangerouslySetInnerHTML={{ __html: html }} />;
}
