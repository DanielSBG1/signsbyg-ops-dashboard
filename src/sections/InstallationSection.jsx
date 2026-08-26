import React, { useState, lazy, Suspense } from 'react';
import { useInstallationMetrics } from '../hooks/useInstallationMetrics';
import InstallationOverview from '../components/installation/InstallationOverview';
import CalendarView from '../components/installation/CalendarView';
const InstallerScorecard = lazy(() => import('../components/installation/InstallerScorecard'));
const TrucksTab = lazy(() => import('../components/installation/TrucksTab'));

const TABS = [
  { id: 'overview',   label: 'Overview'    },
  { id: 'calendar',   label: 'Calendar'    },
  { id: 'installers', label: 'Installers'  },
  { id: 'trucks',     label: 'Trucks'      },
];

export default function InstallationSection() {
  const [activeTab, setActiveTab] = useState('overview');
  const { data, loading, error, lastRefreshed, refresh } = useInstallationMetrics();

  return (
    <div className="min-h-screen text-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Installation</h1>
            {lastRefreshed && (
              <p className="text-gray-500 text-xs mt-1">
                Live snapshot &middot; Updated {lastRefreshed.toLocaleTimeString()}
              </p>
            )}
          </div>
          <button onClick={refresh}
            className="text-gray-500 hover:text-gray-600 text-xs px-3 py-1.5 border border-gray-200 rounded-lg transition-colors">
            Refresh
          </button>
        </div>

        <div className="flex gap-1 bg-black/[0.03] rounded-xl p-1 w-fit">
          {TABS.map(t => (
            <button key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === t.id ? 'bg-black/[0.05] text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && !data && (
          <div className="text-center py-20 text-gray-500">Loading installation data...</div>
        )}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
            Error: {error}
          </div>
        )}

        {data && activeTab === 'overview' && (
          <InstallationOverview data={data} />
        )}

        {data && activeTab === 'installers' && (
          <Suspense fallback={<div className="text-center py-20 text-gray-500">Loading installer scorecard...</div>}>
            <InstallerScorecard data={data} />
          </Suspense>
        )}

        {data && activeTab === 'calendar' && (
          <CalendarView jobs={data.jobs} byCrew={data.byCrew} onRefresh={refresh} />
        )}

        {activeTab === 'trucks' && (
          <Suspense fallback={<div className="text-center py-20 text-gray-500">Loading trucks...</div>}>
            <TrucksTab />
          </Suspense>
        )}
      </div>
    </div>
  );
}
