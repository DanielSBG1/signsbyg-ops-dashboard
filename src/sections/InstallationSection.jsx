import React, { useState } from 'react';
import { useInstallationMetrics } from '../hooks/useInstallationMetrics';
import InstallationOverview from '../components/installation/InstallationOverview';
import CalendarView from '../components/installation/CalendarView';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'calendar', label: 'Calendar' },
];

export default function InstallationSection() {
  const [activeTab, setActiveTab] = useState('overview');
  const { data, loading, error, lastRefreshed, refresh } = useInstallationMetrics();

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Installation</h1>
            {lastRefreshed && (
              <p className="text-white/40 text-xs mt-1">
                Live snapshot · Updated {lastRefreshed.toLocaleTimeString()}
              </p>
            )}
          </div>
          <button onClick={refresh}
            className="text-white/40 hover:text-white/70 text-xs px-3 py-1.5 border border-white/10 rounded-lg transition-colors">
            Refresh
          </button>
        </div>

        <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
          {TABS.map(t => (
            <button key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === t.id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && !data && (
          <div className="text-center py-20 text-white/40">Loading installation data...</div>
        )}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
            Error: {error}
          </div>
        )}

        {data && activeTab === 'overview' && <InstallationOverview data={data} />}
        {data && activeTab === 'calendar' && (
          <CalendarView jobs={data.jobs} byCrew={data.byCrew} onRefresh={refresh} />
        )}
      </div>
    </div>
  );
}
