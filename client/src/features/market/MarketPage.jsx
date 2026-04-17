import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { NodeRenderer } from '../../components/content/NodeRenderer.jsx';
import { useMarketContent } from '../../hooks/content/useMarketContent.js';
import { MarketLoading } from '../../components/market/shared/MarketLoading.jsx';
import { MarketNotFound } from '../../components/market/shared/MarketNotFound.jsx';

function normalizeMarketType(value = '') {
  return String(value).toLowerCase() === 'panel' ? 'panel' : 'jodi';
}

function normalizeSlug(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\.php$/i, '')
    .replace(/[^a-z0-9-]/g, '');
}

function StyleRefs({ styleUrls = [], styleBlocks = [], jsonLdBlocks = [] }) {
  return (
    <>
      {styleUrls.map((href, index) => (
        <link key={`market-style-url-${index}`} rel="stylesheet" href={href} />
      ))}
      {styleBlocks.map((cssText, index) => (
        <style key={`market-style-block-${index}`}>{cssText}</style>
      ))}
      {jsonLdBlocks.map((jsonText, index) => (
        <script key={`market-jsonld-${index}`} type="application/ld+json">
          {jsonText}
        </script>
      ))}
    </>
  );
}

export default function MarketPage() {
  const params = useParams();
  const type = normalizeMarketType(params.type);
  const slug = normalizeSlug(params.slug);

  const { content, renderedBodyNodes, status, error, errorCode, errorStatus } =
    useMarketContent({
      type,
      slug,
    });

  useEffect(() => {
    if (!content?.title) {
      return;
    }
    document.title = content.title;
  }, [content?.title]);

  const handleClickCapture = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    const refreshControl = target.closest('[data-refresh-button="true"]');
    if (!refreshControl) {
      return;
    }

    event.preventDefault();
    window.location.reload();
  };

  if (!slug) {
    return <MarketNotFound type={type} slug={String(params.slug ?? '')} />;
  }

  if (status === 'loading') {
    return <MarketLoading />;
  }

  if (status === 'error') {
    if (errorCode === 'MARKET_PAGE_NOT_FOUND' || errorStatus === 404) {
      return <MarketNotFound type={type} slug={slug} />;
    }

    return (
      <div className="market-error">
        <div>
          <h2>Unable to load market page</h2>
          <p>{error || 'Please try again.'}</p>
          {errorStatus ? <p>Error code: {errorStatus}</p> : null}
          <a className="market-btn" href="/">
            Back To Homepage
          </a>
        </div>
      </div>
    );
  }

  if (!content) {
    return <MarketNotFound type={type} slug={slug} />;
  }

  return (
    <main className="market-page" onClickCapture={handleClickCapture}>
      <StyleRefs
        styleUrls={content.styleUrls}
        styleBlocks={content.styleBlocks}
        jsonLdBlocks={content.jsonLdBlocks}
      />
      <NodeRenderer nodes={renderedBodyNodes} />
    </main>
  );
}
