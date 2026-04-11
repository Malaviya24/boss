import { useCallback } from 'react';
import { JodiMarketTemplate } from '../../components/market/jodi/JodiMarketTemplate.jsx';
import { PanelMarketTemplate } from '../../components/market/panel/PanelMarketTemplate.jsx';
import { MarketLoading } from '../../components/market/shared/MarketLoading.jsx';
import { MarketNotFound } from '../../components/market/shared/MarketNotFound.jsx';
import { useMarketTemplate } from '../../hooks/market/useMarketTemplate.js';
import '../../components/market/shared/market-template.css';

export default function MarketRoutePage({ type, slug }) {
  const { data, status, error, errorCode, errorStatus, isLoadingMore, loadMore } = useMarketTemplate({
    type,
    slug,
  });

  const handleRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  if (status === 'loading') {
    return <MarketLoading />;
  }

  if (status === 'error') {
    if (errorCode === 'MARKET_PAGE_NOT_FOUND') {
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

  if (!data) {
    return <MarketNotFound type={type} slug={slug} />;
  }

  if (type === 'panel') {
    return (
      <PanelMarketTemplate
        data={data}
        onRefresh={handleRefresh}
        onLoadMore={loadMore}
        isLoadingMore={isLoadingMore}
      />
    );
  }

  return (
    <JodiMarketTemplate
      data={data}
      onRefresh={handleRefresh}
      onLoadMore={loadMore}
      isLoadingMore={isLoadingMore}
    />
  );
}
