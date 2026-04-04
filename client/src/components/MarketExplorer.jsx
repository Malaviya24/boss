import { useMemo, useState } from 'react';
import MarketStatusBar from './MarketStatusBar.jsx';

function getFlashClass(fields, target) {
  return fields.includes(target) ? `is-${target} flash-field` : '';
}

export default function MarketExplorer({
  markets,
  recentChanges,
  connectionStatus,
  updatedAt,
  lastScrapeAt,
  candidateApis,
}) {
  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState('all');
  const [changedOnly, setChangedOnly] = useState(false);

  const timeOptions = useMemo(() => {
    return [...new Set(markets.map((market) => market.time).filter(Boolean))];
  }, [markets]);

  const filteredMarkets = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return markets.filter((market) => {
      const matchesSearch = !normalizedSearch
        ? true
        : market.name.toLowerCase().includes(normalizedSearch);
      const matchesTime = timeFilter === 'all' ? true : market.time === timeFilter;
      const matchesChanged = changedOnly ? Boolean(recentChanges[market.key]) : true;

      return matchesSearch && matchesTime && matchesChanged;
    });
  }, [changedOnly, markets, recentChanges, search, timeFilter]);

  const staleCount = useMemo(
    () => markets.filter((market) => market.stale).length,
    [markets],
  );

  return (
    <section className="market-explorer-shell text2">
      <div className="market-explorer-head">
        <h2 className="market-explorer-title">LIVE MARKET EXPLORER</h2>
        <p className="market-explorer-copy">
          Real-time number, jodi, and panel tracking with search and time filters.
        </p>
      </div>

      <MarketStatusBar
        connectionStatus={connectionStatus}
        totalMarkets={markets.length}
        updatedAt={updatedAt}
        lastScrapeAt={lastScrapeAt}
        staleCount={staleCount}
        candidateApis={candidateApis}
      />

      <div className="market-controls">
        <input
          className="market-search"
          type="search"
          placeholder="Search market name"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="market-select"
          value={timeFilter}
          onChange={(event) => setTimeFilter(event.target.value)}
        >
          <option value="all">All times</option>
          {timeOptions.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
        <label className="market-checkbox">
          <input
            type="checkbox"
            checked={changedOnly}
            onChange={(event) => setChangedOnly(event.target.checked)}
          />
          Changed recently
        </label>
      </div>

      <div className="market-grid">
        {filteredMarkets.map((market) => {
          const changedFields = recentChanges[market.key]?.fields ?? [];

          return (
            <article
              key={market.key}
              className={`market-card ${changedFields.length > 0 ? 'flash-card' : ''} ${
                market.stale ? 'is-stale' : ''
              }`}
            >
              <div className="market-card-top">
                <div>
                  <h3 className="market-card-title">{market.name}</h3>
                  <p className="market-card-time">{market.time}</p>
                </div>
                {market.stale ? <span className="market-stale-tag">STALE</span> : null}
              </div>

              <div className="market-values-grid">
                <div className={`market-value-box ${getFlashClass(changedFields, 'number')}`}>
                  <span className="market-value-label">Number</span>
                  <strong className="market-value-main">{market.current.number || '--'}</strong>
                </div>
                <div className={`market-value-box ${getFlashClass(changedFields, 'jodi')}`}>
                  <span className="market-value-label">Jodi</span>
                  <strong className="market-value-main">{market.current.jodi || '--'}</strong>
                </div>
                <div className={`market-value-box ${getFlashClass(changedFields, 'panel')}`}>
                  <span className="market-value-label">Panel</span>
                  <strong className="market-value-main">{market.current.panel || '--'}</strong>
                </div>
              </div>

              <div className="market-card-actions">
                <a
                  className="market-link-button"
                  href={market.links.jodi}
                  target="_blank"
                  rel="noreferrer"
                >
                  View Jodi
                </a>
                <a
                  className="market-link-button"
                  href={market.links.panel}
                  target="_blank"
                  rel="noreferrer"
                >
                  View Panel
                </a>
              </div>
            </article>
          );
        })}
      </div>

      {filteredMarkets.length === 0 ? (
        <p className="market-empty">No markets matched the current filters.</p>
      ) : null}
    </section>
  );
}
