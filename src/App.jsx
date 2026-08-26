import React, { useState, useEffect, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import LoginScreen from './components/LoginScreen';

const PmSection           = lazy(() => import('./sections/PmSection'));
const ProductionSection   = lazy(() => import('./sections/ProductionSection'));
const InstallationSection = lazy(() => import('./sections/InstallationSection'));
const SalesSection        = lazy(() => import('./sections/SalesSection'));
const ExcellenceSection   = lazy(() => import('./sections/ExcellenceSection'));
const MetaAdsSection      = lazy(() => import('./sections/MetaAdsSection'));
const MarketingSection    = lazy(() => import('./sections/MarketingSection'));

function SectionFallback() {
  return (
    <div className="flex items-center justify-center h-64 w-full">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 text-sm">Loading...</p>
      </div>
    </div>
  );
}

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

  const [section, setSection] = useState('sales');

  const [theme, setTheme] = useState(() => localStorage.getItem('sbg-theme') || 'light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sbg-theme', theme);
  }, [theme]);

  if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />;

  return (
    <div className="flex min-h-screen bg-background text-gray-900">
      <Sidebar active={section} onSelect={setSection} onLogout={handleLogout} theme={theme} onThemeChange={setTheme} />

      <main className="flex-1 overflow-auto">
        <Suspense fallback={<SectionFallback />}>
          {section === 'sales'        && <SalesSection />}
          {section === 'pm'           && <PmSection />}
          {section === 'production'   && <ProductionSection />}
          {section === 'installation' && <InstallationSection />}
          {section === 'excellence'    && <ExcellenceSection />}
          {section === 'metaads'      && <MetaAdsSection />}
          {section === 'marketing'    && <MarketingSection />}
        </Suspense>
      </main>
    </div>
  );
}
