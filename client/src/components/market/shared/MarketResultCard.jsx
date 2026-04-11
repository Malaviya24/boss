export function MarketResultCard({ name, value, onRefresh, type }) {
  return (
    <section className="market-card market-result">
      <div className="market-result-name">{name || (type === 'panel' ? 'Panel Result' : 'Jodi Result')}</div>
      <div className="market-result-value">{value || 'Loading...'}</div>
      <div className="market-actions">
        <button className="market-btn" type="button" onClick={onRefresh}>
          Refresh Result
        </button>
        <a className="market-btn" href="#market-bottom">
          Go To Bottom
        </a>
      </div>
    </section>
  );
}
