import React, { useState, lazy, Suspense } from 'react';
import { useProductionData } from '../hooks/useProductionData';
import WeeklyOverview from '../components/production/WeeklyOverview';
import OverviewTab from '../components/production/OverviewTab';
import CalendarView from '../components/production/CalendarView';

const SubtasksTab = lazy(() => import('../components/production/SubtasksTab'));

const TABS = [
  { id: 'overview',  label: 'Overview' },
  { id: 'subtasks',  label: 'Subtasks' },
  { id: 'calendar',  label: 'Calendar' },
];

export default function ProductionSection() {
  const [activeTab, setActiveTab]       = useState('overview');
  const [overviewMode, setOverviewMode] = useState('weekly'); // 'weekly' | 'list'
  const { data, loading, error, refresh } = useProductionData();

  return (
    <div className="min-h-screen text-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Production</h1>
            {data && (
              <p className="text-gray-400 text-xs mt-1">
                Live snapshot · Updated {new Date(data.generatedAt).toLocaleTimeString()}
              </p>
            )}
          </div>
          <button onClick={refresh}
            className="text-gray-400 hover:text-gray-600 text-xs px-3 py-1.5 border border-gray-200 rounded-lg transition-colors">
            Refresh
          </button>
        </div>

        <div className="flex gap-1 bg-black/[0.03] rounded-xl p-1 w-fit">
          {TABS.map(t => (
            <button key={t.id}
              onClick={() => {
                setActiveTab(t.id);
                if (t.id === 'overview') setOverviewMode('weekly');
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === t.id ? 'bg-black/[0.05] text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-20 text-gray-400">Loading production data...</div>}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
            Error: {error}
          </div>
        )}

        {data && activeTab === 'overview' && overviewMode === 'weekly' && (
          <WeeklyOverview data={data} onSwitchToList={() => setOverviewMode('list')} />
        )}
        {data && activeTab === 'overview' && overviewMode === 'list' && (
          <>
            <div className="flex justify-end">
              <button
                onClick={() => setOverviewMode('weekly')}
                className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                ← Weekly view
              </button>
            </div>
            <OverviewTab data={data} />
          </>
        )}
        {data && activeTab === 'subtasks' && (
          <Suspense fallback={<div className="text-center py-20 text-gray-400">Loading subtasks...</div>}>
            <SubtasksTab data={data} />
          </Suspense>
        )}
        {data && activeTab === 'calendar'    && <CalendarView rawJobs={data.jobs} onRefresh={refresh} />}
      </div>
    </div>
  );
}
