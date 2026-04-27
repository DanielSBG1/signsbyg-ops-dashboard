import React, { useState, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';

const PmSection           = lazy(() => import('./sections/PmSection'));
const ProductionSection   = lazy(() => import('./sections/ProductionSection'));
const InstallationSection = lazy(() => import('./sections/InstallationSection'));
const SalesSection        = lazy(() => import('./sections/SalesSection'));

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
  const [section, setSection] = useState('sales');

  return (
    <div className="flex min-h-screen bg-slate text-white">
      <Sidebar active={section} onSelect={setSection} />

      <main className="flex-1 overflow-auto">
        <Suspense fallback={<SectionFallback />}>
          {section === 'sales'        && <SalesSection />}
          {section === 'pm'           && <PmSection />}
          {section === 'production'   && <ProductionSection />}
          {section === 'installation' && <InstallationSection />}
        </Suspense>
      </main>
    </div>
  );
}
