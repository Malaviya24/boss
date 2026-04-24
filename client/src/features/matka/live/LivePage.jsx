import { useEffect, useMemo, useState } from 'react';
import {
  getLiveMarketBySlug,
  getLiveMarkets,
  getReadableErrorMessage,
} from '../../../services/matka/matka-api.js';
import { useMatkaRealtime } from '../../../hooks/matka/useMatkaRealtime.js';

function formatCountdown(targetIso) {
  if (!targetIso) {
    return '';
  }

  const deltaMs = new Date(targetIso).getTime() - Date.now();
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return '00:00';
  }

  const totalSeconds = Math.floor(deltaMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function phaseLabel(phase) {
  if (phase === 'open_loading' || phase === 'close_loading') {
    return 'Loading';
  }
  if (phase === 'open_revealed') {
    return 'Open Result';
  }
  if (phase === 'closed') {
    return 'Final Result';
  }
  return 'Result Coming';
}

function MarketCard({ market, onRefresh }) {
  const countdown = formatCountdown(market.nextTransitionAt);

  return (
    <article className="matka-card">
      <header className="matka-card-head">
        <h3>{market.name}</h3>
        <button type="button" onClick={() => onRefresh(market.slug)}>
          Refresh
        </button>
      </header>
      <p className="matka-time">
        {market.openTimeLabel} - {market.closeTimeLabel}
      </p>
      <p className={`matka-phase phase-${market.phase}`}>{phaseLabel(market.phase)}</p>
      <div className="matka-result-wrap">
        {(market.phase === 'open_loading' ||
          (market.phase === 'close_loading' && market.resultText === 'Loading...')) && (
          <div className="matka-loader" aria-hidden="true" />
        )}
        <p className="matka-result-value">{market.resultText || 'Result Coming'}</p>
      </div>
      {countdown ? <p className="matka-countdown">Next in: {countdown}</p> : null}
    </article>
  );
}

export default function LivePage() {
  const [markets, setMarkets] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    document.title = 'Live Matka Results';
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setError('');
        const nextMarkets = await getLiveMarkets();
        setMarkets(Array.isArray(nextMarkets) ? nextMarkets : []);
        setStatus('ready');
      } catch (requestError) {
        setError(getReadableErrorMessage(requestError, 'Unable to load live markets'));
        setStatus('error');
      }
    };

    void load();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((current) => current + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const nextMarkets = await getLiveMarkets();
        setMarkets(Array.isArray(nextMarkets) ? nextMarkets : []);
      } catch {
        // Keep realtime page alive even if one poll fails.
      }
    }, 10000);

    return () => window.clearInterval(timer);
  }, []);

  useMatkaRealtime({
    enabled: true,
    onMarketsUpdated: (payload) => {
      const nextMarkets = payload?.markets;
      if (Array.isArray(nextMarkets)) {
        setMarkets(nextMarkets);
      }
    },
  });

  const sortedMarkets = useMemo(
    () =>
      [...markets].sort(
        (left, right) =>
          (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
          String(left.name ?? '').localeCompare(String(right.name ?? '')),
      ),
    [markets, tick],
  );

  const refreshOne = async (slug) => {
    try {
      const nextMarket = await getLiveMarketBySlug({ slug });
      setMarkets((current) =>
        current.map((item) => (item.slug === slug ? nextMarket : item)),
      );
    } catch {
      // Ignore single-card refresh failures.
    }
  };

  if (status === 'loading') {
    return (
      <div className="matka-page-shell">
        <div className="clone-spinner" aria-hidden="true" />
        <p>Loading live results...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="matka-page-shell">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <main className="matka-page-shell">
      <section className="matka-header">
        <h1>Live Matka Markets</h1>
        <p>Real-time auto updates with open/close reveal flow.</p>
      </section>
      <section className="matka-grid">
        {sortedMarkets.map((market) => (
          <MarketCard key={market.marketId} market={market} onRefresh={refreshOne} />
        ))}
      </section>
    </main>
  );
}
