export function MarketQuickLinks({ links = [] }) {
  if (!Array.isArray(links) || links.length === 0) {
    return null;
  }

  return (
    <section className="market-card market-links">
      {links.map((link, index) => (
        <a
          key={`${link.href}-${index}`}
          href={link.href}
          target={link.href.startsWith('/') ? undefined : '_blank'}
          rel={link.href.startsWith('/') ? undefined : 'noopener noreferrer'}
        >
          {link.label}
        </a>
      ))}
    </section>
  );
}
