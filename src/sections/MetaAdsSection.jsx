import React, { useState } from 'react';
import { useMetaAdsData } from '../hooks/useMetaAdsData';
import MetaAdsOverview from '../components/metaads/MetaAdsOverview';
import CampaignsTab from '../components/metaads/CampaignsTab';
import AdSetsTab from '../components/metaads/AdSetsTab';

const TABS = [
  { id: 'overview',  label: 'Overview' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'adsets',    label: 'Ad Sets' },
];

const PRESETS = [
  { id: 'month',   label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year',    label: 'Year' },
];

export default function MetaAdsSection() {
  const [activeTab, setActiveTab] = useState('overview');
  const [preset, setPreset] = useState('month');
  const { data, loading, error, lastRefreshed, refresh } = useMetaAdsData(preset);

  return (
    <div className="min-h-screen text-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Meta Ads</h1>
            {lastRefreshed && (
              <p className="text-gray-500 text-xs mt-1">
                Last refreshed {lastRefreshed.toLocaleTimeString()}
              </p>
            )}
          </div>
          <button
            onClick={refresh}
            className="text-gray-500 hover:text-gray-600 text-xs px-3 py-1.5 border border-gray-200 rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Tab bar + period selector */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1 bg-black/[0.03] rounded-xl p-1 w-fit">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === t.id
                    ? 'bg-black/[0.05] text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  preset === p.id
                    ? 'bg-accent text-gray-900'
                    : 'bg-black/[0.03] text-gray-500 hover:text-gray-700 hover:bg-black/[0.05]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && !data && (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-500 text-sm">Loading Meta Ads data...</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-danger/20 border border-danger/40 rounded-xl px-4 py-3 text-danger text-sm">
            Failed to load data: {error}
          </div>
        )}

        {/* Tab content */}
        {data && activeTab === 'overview'  && <MetaAdsOverview data={data} />}
        {data && activeTab === 'campaigns' && <CampaignsTab campaigns={data.campaigns ?? []} />}
        {data && activeTab === 'adsets'    && <AdSetsTab adSets={data.adSets ?? []} />}
      </div>
    </div>
  );
}
