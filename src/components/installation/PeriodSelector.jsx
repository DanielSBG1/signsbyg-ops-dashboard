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
              : 'bg-white/5 text-white/70 hover:bg-white/10'
          }`}
        >
          {p.label}
        </button>
      ))}
      {range && range.start && (
        <span className="text-white/40 text-xs ml-2">
          {range.start} → {range.end}
        </span>
      )}
    </div>
  );
}
