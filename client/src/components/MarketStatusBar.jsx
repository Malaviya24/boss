function formatTime(value) {
  if (!value) {
    return 'Waiting for scrape';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function MarketStatusBar({
  connectionStatus,
  totalMarkets,
  updatedAt,
  lastScrapeAt,
  staleCount,
  candidateApis,
}) {
  return (
    <div className="market-status-shell">
      <div className="market-status-strip">
        <span className="market-pill">Mode: {connectionStatus}</span>
        <span className="market-pill">Markets: {totalMarkets}</span>
        <span className="market-pill">Updated: {formatTime(updatedAt)}</span>
        <span className="market-pill">Last scrape: {formatTime(lastScrapeAt)}</span>
        <span className="market-pill">Stale: {staleCount}</span>
      </div>
      {candidateApis.length > 0 ? (
        <p className="market-diagnostics">
          Candidate upstream APIs detected: {candidateApis.join(', ')}
        </p>
      ) : null}
    </div>
  );
}
