import React from 'react';

// Computed in render so the label reflects the current calendar quarter
function getPeriods() {
  const currentQuarter = Math.floor(new Date().getMonth() / 3) + 1;
  return [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'lastweek', label: 'Last Week' },
    { value: 'month', label: 'This Month' },
    { value: 'q1', label: 'Q1', isQuarter: true, isCurrent: currentQuarter === 1 },
    { value: 'q2', label: 'Q2', isQuarter: true, isCurrent: currentQuarter === 2 },
    { value: 'q3', label: 'Q3', isQuarter: true, isCurrent: currentQuarter === 3 },
    { value: 'q4', label: 'Q4', isQuarter: true, isCurrent: currentQuarter === 4 },
    { value: 'year', label: 'This Year' },
    { value: 'custom', label: 'Custom' },
  ];
}

const TABS = [
  { value: 'sales', label: 'Sales' },
  { value: 'calls', label: 'Calls' },
  { value: 'handoffs', label: 'Handoffs' },
  { value: 'pipeline', label: 'Pipeline Health' },
];

export default function TopBar({ tab, setTab, period, setPeriod, customRange, setCustomRange, lastRefreshed, onRefresh, loading }) {
  return (
    <header className="bg-slate-card border-b border-white/10 px-6 py-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold tracking-tight">
              <span className="text-accent">Signs By G</span>{' '}
              <span className="text-white/70 font-medium">Sales Command Center</span>
            </h1>
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    tab === t.value
                      ? 'bg-accent text-white'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {getPeriods().map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                title={p.isQuarter && p.isCurrent ? 'Current quarter' : undefined}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors relative ${
                  period === p.value
                    ? 'bg-accent text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                } ${p.isQuarter && p.isCurrent && period !== p.value ? 'ring-1 ring-accent/40' : ''}`}
              >
                {p.label}
                {p.isQuarter && p.isCurrent && (
                  <span className="absolute top-0 right-0 -mt-1 -mr-1 w-1.5 h-1.5 rounded-full bg-accent" />
                )}
              </button>
            ))}
          </div>
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-3 mt-3">
            <input
              type="date"
              value={customRange.start}
              onChange={(e) => setCustomRange((r) => ({ ...r, start: e.target.value }))}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
            />
            <span className="text-white/40">to</span>
            <input
              type="date"
              value={customRange.end}
              onChange={(e) => setCustomRange((r) => ({ ...r, end: e.target.value }))}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
            />
          </div>
        )}

        <div className="flex items-center gap-3 mt-3 text-xs text-white/40">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1 text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          {lastRefreshed && <span>Last updated: {lastRefreshed.toLocaleTimeString()}</span>}
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Auto-refresh: 15 min
          </span>
        </div>
      </div>
    </header>
  );
}
