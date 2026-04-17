import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

const HomePage = lazy(() => import('./features/homepage/HomePage.jsx'));
const MarketPage = lazy(() => import('./features/market/MarketPage.jsx'));
const AdminLoginPage = lazy(() => import('./features/matka/admin/AdminLoginPage.jsx'));
const AdminDashboardPage = lazy(() => import('./features/matka/admin/AdminDashboardPage.jsx'));

function RouteFallback() {
  return (
    <div className="clone-loading">
      <div className="clone-spinner" aria-hidden="true" />
      <div>Loading DPBOSS...</div>
    </div>
  );
}

function NavigationInterceptor() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleClick = (event) => {
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

      const target = event.target instanceof Element ? event.target : null;
      if (!target) {
        return;
      }

      const anchor = target.closest('a[href]');
      if (!anchor) {
        return;
      }

      const rawHref = String(anchor.getAttribute('href') ?? '').trim();
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

      const nextPathname = nextUrl.pathname || '/';
      const isHandledRoute =
        nextPathname === '/' ||
        nextPathname.startsWith('/market/') ||
        nextPathname.startsWith('/admin-x-secure-portal');
      if (!isHandledRoute) {
        return;
      }

      event.preventDefault();
      const nextLocation = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      const currentLocation = `${location.pathname}${location.search}${location.hash}`;
      if (nextLocation !== currentLocation) {
        navigate(nextLocation);
      }
    };

    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('click', handleClick);
    };
  }, [location.hash, location.pathname, location.search, navigate]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <NavigationInterceptor />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/live" element={<Navigate to="/" replace />} />
          <Route path="/market/:type/:slug" element={<MarketPage />} />
          <Route path="/market/:type/:slug.php" element={<MarketPage />} />
          <Route path="/admin-x-secure-portal" element={<AdminLoginPage />} />
          <Route path="/admin-x-secure-portal/dashboard" element={<AdminDashboardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
