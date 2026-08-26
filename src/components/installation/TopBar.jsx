import React from 'react';

export default function TopBar({ lastRefreshed, onRefresh }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">Installation</h1>
        {lastRefreshed && (
          <p className="text-gray-500 text-xs mt-1">
            Live snapshot · Updated {lastRefreshed.toLocaleTimeString()}
          </p>
        )}
      </div>
      <button
        onClick={onRefresh}
        className="text-gray-500 hover:text-gray-600 text-xs px-3 py-1.5 border border-gray-200 rounded-lg transition-colors"
      >
        Refresh
      </button>
    </div>
  );
}
