import React, { useState, useEffect, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import LoginScreen from './components/LoginScreen';
import ErrorBoundary from './components/ErrorBoundary';
import { SectionSkeleton } from './components/Skeleton';
import useMemoryMonitor from './hooks/useMemoryMonitor';

const PmSection           = lazy(() => import('./sections/PmSection'));
const ProductionSection   = lazy(() => import('./sections/ProductionSection'));
const InstallationSection = lazy(() => import('./sections/InstallationSection'));
const SalesSection        = lazy(() => import('./sections/SalesSection'));
const ExcellenceSection   = lazy(() => import('./sections/ExcellenceSection'));
const MetaAdsSection      = lazy(() => import('./sections/MetaAdsSection'));
const MarketingSection    = lazy(() => import('./sections/MarketingSection'));

export default function App() {
  const [authed, setAuthed] = useState(() => {
    try {
      const session = sessionStorage.getItem('sbg-session');
      if (!session) return false;
      const { timestamp } = JSON.parse(session);
      return Date.now() - timestamp < 24 * 60 * 60 * 1000;
    } catch { return false; }
  });

  const handleLogout = () => {
    sessionStorage.removeItem('sbg-session');
    setAuthed(false);
  };

  const { showWarning, dismiss } = useMemoryMonitor();

  const [section, setSection] = useState('sales');

  const [theme, setTheme] = useState(() => localStorage.getItem('sbg-theme') || 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sbg-theme', theme);
  }, [theme]);

  if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />;

  return (
    <div className="flex min-h-screen bg-background text-gray-900">
      {showWarning && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-sm">
          <span className="text-amber-800">Dashboard has been open a while — refresh for best performance</span>
          <div className="flex gap-2">
            <button onClick={() => window.location.reload()} className="px-3 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded text-xs font-medium">Refresh</button>
            <button onClick={dismiss} className="px-2 py-1 text-amber-600 hover:text-amber-800 text-xs">Dismiss</button>
          </div>
        </div>
      )}
      <Sidebar active={section} onSelect={setSection} onLogout={handleLogout} theme={theme} onThemeChange={setTheme} />

      <main className="flex-1 overflow-auto">
        <ErrorBoundary>
          <Suspense fallback={<SectionSkeleton />}>
            {section === 'sales'        && <SalesSection />}
            {section === 'pm'           && <PmSection />}
            {section === 'production'   && <ProductionSection />}
            {section === 'installation' && <InstallationSection />}
            {section === 'excellence'    && <ExcellenceSection />}
            {section === 'metaads'      && <MetaAdsSection />}
            {section === 'marketing'    && <MarketingSection />}
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
