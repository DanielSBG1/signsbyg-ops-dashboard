import React from 'react';

export default function SummaryCards({ summary }) {
  if (!summary) return null;

  const cards = [
    { label: 'Open',      value: summary.open,      color: '' },
    { label: 'Late',      value: summary.late,      color: summary.late > 0 ? 'text-danger' : '' },
    { label: 'On Time',   value: summary.early + summary.onTime, color: 'text-success' },
    { label: 'Completed', value: summary.early + summary.onTime + summary.failed, color: 'text-gray-500' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(c => (
        <div key={c.label} className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-gray-500 text-xs uppercase tracking-wider">{c.label}</p>
          <p className={`text-3xl font-bold tabular-nums mt-1 ${c.color}`}>{c.value ?? 0}</p>
        </div>
      ))}
    </div>
  );
}
