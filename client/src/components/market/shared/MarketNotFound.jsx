export function MarketNotFound({ type, slug }) {
  return (
    <div className="market-not-found">
      <div>
        <h1>Page Not Available</h1>
        <p>We could not find this local {type} page.</p>
        <p>
          <strong>{slug}</strong>
        </p>
        <a className="market-btn" href="/">
          Back To Homepage
        </a>
      </div>
    </div>
  );
}
