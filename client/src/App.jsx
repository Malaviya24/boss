import { Suspense, lazy } from 'react';

const HomePage = lazy(() => import('./pages/HomePage.jsx'));

export default function App() {
  return (
    <Suspense fallback={<div className="clone-loading">Loading DPBOSS...</div>}>
      <HomePage />
    </Suspense>
  );
}
