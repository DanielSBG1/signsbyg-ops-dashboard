import React, { useState } from 'react';
import { useProductionData } from '../hooks/useProductionData';
import { useThroughput } from '../hooks/useThroughput';
import OverviewTab from '../components/production/OverviewTab';
import DepartmentLoadTab from '../components/production/DepartmentLoadTab';
import ThroughputTab from '../components/production/ThroughputTab';

const TABS = [
  { id: 'overview',    label: 'Overview' },
  { id: 'departments', label: 'Department Load' },
  { id: 'throughput',  label: 'Throughput' },
];

export default function ProductionSection() {
  const [activeTab, setActiveTab]         = useState('overview');
  const { data, loading, error, refresh } = useProductionData();
  const { data: throughputData }          = useThroughput();

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Production</h1>
            {data && (
              <p className="text-white/40 text-xs mt-1">
                Live snapshot · Updated {new Date(data.generatedAt).toLocaleTimeString()}
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
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === t.id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-20 text-white/40">Loading production data...</div>}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
            Error: {error}
          </div>
        )}

        {data && activeTab === 'overview'    && <OverviewTab data={data} />}
        {data && activeTab === 'departments' && <DepartmentLoadTab data={data} />}
        {activeTab === 'throughput'          && <ThroughputTab data={throughputData} />}
      </div>
    </div>
  );
}
