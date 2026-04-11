import { MarketHeader } from './MarketHeader.jsx';
import { MarketQuickLinks } from './MarketQuickLinks.jsx';
import { MarketRecordTable } from './MarketRecordTable.jsx';

export function MarketTemplateBase({ data, type, onRefresh, onLoadMore, isLoadingMore }) {
  const handleRawControlClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    const refreshControl = target.closest('[data-refresh-button="true"]');
    if (refreshControl) {
      event.preventDefault();
      onRefresh?.();
      return;
    }

    const scrollControl = target.closest('[data-market-scroll]');
    if (!scrollControl) {
      return;
    }

    event.preventDefault();
    const mode = String(scrollControl.getAttribute('data-market-scroll') ?? '').toLowerCase();
    const anchorId = mode === 'bottom' ? 'market-bottom' : 'market-top';
    const anchor = document.getElementById(anchorId);
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <main className="market-page" onClickCapture={handleRawControlClick}>
      {Array.isArray(data.styleUrls)
        ? data.styleUrls.map((styleUrl, index) => (
            <link key={`market-style-url-${index}`} rel="stylesheet" href={styleUrl} />
          ))
        : null}
      {Array.isArray(data.styleBlocks)
        ? data.styleBlocks.map((styleBlock, index) => (
            <style
              key={`market-style-block-${index}`}
              dangerouslySetInnerHTML={{ __html: styleBlock }}
            />
          ))
        : null}
      <div id="market-top" />

      <MarketHeader logoUrl={data.logoUrl} heading={data.heading || data.title} summary={data.summary} />

      {Array.isArray(data.heroHtmlBlocks) && data.heroHtmlBlocks.length > 0 ? (
        <section className="market-hero-wrap">
          {data.heroHtmlBlocks.map((blockHtml, index) => (
            <div
              key={`market-hero-${index}`}
              className="market-hero-block"
              dangerouslySetInnerHTML={{ __html: blockHtml }}
            />
          ))}
        </section>
      ) : (
        <section className="market-hero-wrap market-hero-fallback">
          <div className="chart-result">
            <div>{data.heading || data.title || 'Market Result'}</div>
            <span>{data.result?.value || 'Loading...'}</span>
            <br />
            <button type="button" data-refresh-button="true">
              Refresh Result
            </button>
          </div>
          <button type="button" className="market-fallback-bottom-btn" data-market-scroll="bottom">
            Go to Bottom
          </button>
        </section>
      )}

      <MarketRecordTable
        table={data.table}
        tableHtmlBlocks={data.tableHtmlBlocks}
        onLoadMore={onLoadMore}
        isLoadingMore={isLoadingMore}
      />

      {Array.isArray(data.footerHtmlBlocks) && data.footerHtmlBlocks.length > 0 ? (
        <section className="market-footer-wrap">
          {data.footerHtmlBlocks.map((blockHtml, index) => (
            <div
              key={`market-footer-${index}`}
              className="market-footer-block"
              dangerouslySetInnerHTML={{ __html: blockHtml }}
            />
          ))}
        </section>
      ) : null}

      <MarketQuickLinks links={data.links} />

      <div id="market-bottom" />
    </main>
  );
}
