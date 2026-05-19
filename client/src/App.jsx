import { Suspense, lazy, useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';

const HomePage = lazy(() => import('./features/homepage/HomePage.jsx'));
const MarketPage = lazy(() => import('./features/market/MarketPage.jsx'));
const AdminLoginPage = lazy(() => import('./features/matka/admin/AdminLoginPage.jsx'));
const AdminDashboardPage = lazy(() => import('./features/matka/admin/AdminDashboardPage.jsx'));

const AboutPage = lazy(() => import('./features/static-pages/AboutPage.jsx'));
const PrivacyPage = lazy(() => import('./features/static-pages/PrivacyPage.jsx'));
const TosPage = lazy(() => import('./features/static-pages/TosPage.jsx'));
const MatkaJodiCountChartPage = lazy(
  () => import('./features/static-pages/MatkaJodiCountChartPage.jsx'),
);
const JodiChartFamilyMatkaPage = lazy(
  () => import('./features/static-pages/JodiChartFamilyMatkaPage.jsx'),
);
const PenalCountChartPage = lazy(
  () => import('./features/static-pages/PenalCountChartPage.jsx'),
);
const PenalTotalChartPage = lazy(
  () => import('./features/static-pages/PenalTotalChartPage.jsx'),
);
const AllCardPattiChartPage = lazy(
  () => import('./features/static-pages/AllCardPattiChartPage.jsx'),
);
const FixOpenToCloseByDatePage = lazy(
  () => import('./features/static-pages/FixOpenToCloseByDatePage.jsx'),
);
const MatkakingResultApiPage = lazy(
  () => import('./features/static-pages/DpbossResultApiPage.jsx'),
);
const MatkakingResultApiDocumentationPage = lazy(
  () => import('./features/static-pages/DpbossResultApiDocumentationPage.jsx'),
);
const ContactPage = lazy(
  () => import('./features/static-pages/ContactPage.jsx'),
);

const STATIC_PAGE_ROUTES = new Set([
  '/about',
  '/about.php',
  '/contact',
  '/contact.php',
  '/privacy',
  '/privacy.php',
  '/tos',
  '/tos.php',
  '/matka-jodi-count-chart',
  '/matka-jodi-count-chart.php',
  '/jodi-chart-family-matka',
  '/jodi-chart-family-matka.php',
  '/penal-count-chart',
  '/penal-count-chart.php',
  '/penal-total-chart',
  '/penal-total-chart.php',
  '/all-22-card-panna-penal-patti-chart',
  '/all-22-card-panna-penal-patti-chart.php',
  '/fix-open-to-close-by-date',
  '/fix-open-to-close-by-date.php',
  '/matkaking-result-api',
  '/matkaking-result-api.php',
  '/matkaking-result-api-documentation',
]);

function RouteFallback() {
  return (
    <div className="clone-loading">
      <div className="clone-spinner" aria-hidden="true" />
      <div>Loading MATKAKING...</div>
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
        nextPathname.startsWith('/jodi-chart-record/') ||
        nextPathname.startsWith('/panel-chart-record/') ||
        nextPathname.startsWith('/hs-online-bb-15-minutes-chart/') ||
        nextPathname.startsWith('/admin-x-secure-portal') ||
        STATIC_PAGE_ROUTES.has(nextPathname);
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
          <Route path="/jodi-chart-record/:slug.php" element={<MarketPage routeType="jodi" />} />
          <Route path="/panel-chart-record/:slug.php" element={<MarketPage routeType="panel" />} />
          <Route path="/hs-online-bb-15-minutes-chart/:slug.php" element={<MarketPage routeType="hs-online-bb-15-minutes" />} />
          <Route path="/admin-x-secure-portal" element={<AdminLoginPage />} />
          <Route path="/admin-x-secure-portal/dashboard" element={<AdminDashboardPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/contact.php" element={<ContactPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/tos" element={<TosPage />} />
          <Route path="/matka-jodi-count-chart" element={<MatkaJodiCountChartPage />} />
          <Route path="/jodi-chart-family-matka" element={<JodiChartFamilyMatkaPage />} />
          <Route path="/penal-count-chart" element={<PenalCountChartPage />} />
          <Route path="/penal-total-chart" element={<PenalTotalChartPage />} />
          <Route
            path="/all-22-card-panna-penal-patti-chart"
            element={<AllCardPattiChartPage />}
          />
          <Route path="/fix-open-to-close-by-date" element={<FixOpenToCloseByDatePage />} />
          <Route path="/matkaking-result-api" element={<MatkakingResultApiPage />} />
          <Route path="/matkaking-result-api.php" element={<MatkakingResultApiPage />} />
          <Route
            path="/matkaking-result-api-documentation"
            element={<MatkakingResultApiDocumentationPage />}
          />
          <Route path="/about.php" element={<AboutPage />} />
          <Route path="/privacy.php" element={<PrivacyPage />} />
          <Route path="/tos.php" element={<TosPage />} />
          <Route path="/matka-jodi-count-chart.php" element={<MatkaJodiCountChartPage />} />
          <Route
            path="/jodi-chart-family-matka.php"
            element={<JodiChartFamilyMatkaPage />}
          />
          <Route path="/penal-count-chart.php" element={<PenalCountChartPage />} />
          <Route path="/penal-total-chart.php" element={<PenalTotalChartPage />} />
          <Route
            path="/all-22-card-panna-penal-patti-chart.php"
            element={<AllCardPattiChartPage />}
          />
          <Route
            path="/fix-open-to-close-by-date.php"
            element={<FixOpenToCloseByDatePage />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
