import React from 'react';

export default function SummaryCards({ summary }) {
  if (!summary) return null;

  const cards = [
    { label: 'Open Jobs',       value: summary.open,            sub: `${summary.total} total` },
    { label: 'Scheduled',       value: summary.scheduled,       sub: 'on track' },
    { label: 'At Risk',         value: summary.atRisk,          sub: 'future date, resched.',   color: summary.atRisk > 0 ? 'text-warning' : 'text-gray-900' },
    { label: 'Pending Date',    value: summary.pending,         sub: 'no date yet' },
    { label: 'Late',            value: summary.late,            sub: 'past date, open',         color: 'text-danger' },
    { label: 'On-Time Rate',    value: `${summary.onTimeRate}%`, sub: 'first-try hits',         color: summary.onTimeRate >= 80 ? 'text-success' : summary.onTimeRate >= 60 ? 'text-warning' : 'text-danger' },
    { label: 'Rescheduled 1x',  value: summary.rescheduledOnce, sub: 'yellow flag',             color: summary.rescheduledOnce > 0 ? 'text-warning' : 'text-gray-900' },
    { label: 'Rescheduled 2x+', value: summary.rescheduledMulti, sub: 'red flag',               color: summary.rescheduledMulti > 0 ? 'text-danger' : 'text-gray-900' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="text-gray-500 text-xs uppercase tracking-wider font-medium">{c.label}</div>
          <div className={`text-3xl font-bold mt-2 tabular-nums ${c.color || 'text-gray-900'}`}>{c.value}</div>
          <div className="text-gray-400 text-xs mt-1">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
