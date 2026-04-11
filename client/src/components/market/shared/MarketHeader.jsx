export function MarketHeader({ logoUrl, heading, summary }) {
  return (
    <section className="market-card">
      <div className="market-logo-wrap">
        {logoUrl ? (
          <img className="market-logo" src={logoUrl} alt="Market logo" loading="eager" decoding="async" />
        ) : null}
      </div>

      <h1 className="market-title">{heading || 'Market Chart'}</h1>

      <div className="market-summary">
        {summary?.title ? <h2>{summary.title}</h2> : null}
        {summary?.description ? <p>{summary.description}</p> : null}
      </div>
    </section>
  );
}
