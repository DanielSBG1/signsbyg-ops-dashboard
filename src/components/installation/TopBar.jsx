import React from 'react';

export default function TopBar({ lastRefreshed, onRefresh, loading }) {
  return (
    <div className="bg-slate-card border-b border-white/5 px-6 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold">Signs By G</h1>
        <p className="text-white/40 text-sm">Installation Command Center</p>
      </div>
      <div className="flex items-center gap-4">
        {lastRefreshed && (
          <span className="text-white/40 text-xs">
            Updated {lastRefreshed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="bg-accent/20 hover:bg-accent/30 text-accent px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
