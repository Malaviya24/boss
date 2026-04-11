import { Suspense, lazy, useEffect, useState } from 'react';
import { parseMarketRoute } from './utils/market/route.js';

const HomePage = lazy(() => import('./pages/HomePage.jsx'));
const MarketRoutePage = lazy(() => import('./pages/market/MarketRoutePage.jsx'));

function getCurrentPathname() {
  if (typeof window === 'undefined') {
    return '/';
  }

  return window.location.pathname || '/';
}

export default function App() {
  const [pathname, setPathname] = useState(getCurrentPathname);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(getCurrentPathname());
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    const handleDocumentClick = (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest('a[href]');
      if (!anchor) {
        return;
      }

      const rawHref = anchor.getAttribute('href') ?? '';
      if (!rawHref || rawHref.startsWith('#')) {
        return;
      }

      const anchorTarget = String(anchor.getAttribute('target') ?? '').toLowerCase();
      if (anchorTarget && anchorTarget !== '_self') {
        return;
      }

      let nextUrl;
      try {
        nextUrl = new URL(rawHref, window.location.origin);
      } catch {
        return;
      }

      if (nextUrl.origin !== window.location.origin) {
        return;
      }

      const isMarketRoute = Boolean(parseMarketRoute(nextUrl.pathname));
      const isHomepageRoute = nextUrl.pathname === '/';
      if (!isMarketRoute && !isHomepageRoute) {
        return;
      }

      event.preventDefault();

      const nextLocation = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextLocation !== currentLocation) {
        window.history.pushState({}, '', nextLocation);
      }

      setPathname(nextUrl.pathname || '/');
      if (!nextUrl.hash) {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    };

    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, []);

  const marketRoute = parseMarketRoute(pathname);

  return (
    <Suspense fallback={<div className="clone-loading">Loading DPBOSS...</div>}>
      {marketRoute ? (
        <MarketRoutePage type={marketRoute.type} slug={marketRoute.slug} />
      ) : (
        <HomePage />
      )}
    </Suspense>
  );
}
