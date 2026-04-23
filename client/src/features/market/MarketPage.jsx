import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useMarketContent } from '../../hooks/content/useMarketContent.js';
import { MarketLoading } from '../../components/market/shared/MarketLoading.jsx';
import { MarketNotFound } from '../../components/market/shared/MarketNotFound.jsx';
import { MarketTemplate } from '../../components/market/MarketTemplate.jsx';

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

export default function MarketPage({ routeType = '' } = {}) {
  const params = useParams();
  const type = normalizeMarketType(routeType || params.type);
  const slug = normalizeSlug(params.slug);

  const {
    content,
    liveRecord,
    status,
    error,
    errorCode,
    errorStatus,
    refresh,
  } = useMarketContent({
    type,
    slug,
  });

  useEffect(() => {
    if (!content?.title) {
      return;
    }
    document.title = content.title;
  }, [content?.title]);

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
          <button className="market-btn" onClick={refresh}>
            Retry Now
          </button>
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
    <MarketTemplate
      content={content}
      type={type}
      liveRecord={liveRecord}
      onRefresh={refresh}
    />
  );
}
