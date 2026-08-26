import React from 'react';

const PERIODS = [
  { key: 'live',  label: 'Live',       sub: 'All open + recent' },
  { key: 'week',  label: 'This Week',  sub: 'Sun–Sat' },
  { key: 'month', label: 'This Month', sub: 'Calendar month' },
];

export default function PeriodSelector({ period, setPeriod, range }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => setPeriod(p.key)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            period === p.key
              ? 'bg-accent text-white'
              : 'bg-black/[0.03] text-gray-600 hover:bg-black/[0.05]'
          }`}
        >
          {p.label}
        </button>
      ))}
      {range && range.start && (
        <span className="text-gray-500 text-xs ml-2">
          {range.start} → {range.end}
        </span>
      )}
    </div>
  );
}
