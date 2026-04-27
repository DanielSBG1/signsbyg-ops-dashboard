import React from 'react';

export default function SummaryCards({ summary }) {
  if (!summary) return null;

  const cards = [
    { label: 'Open Jobs',       value: summary.open,       sub: `${summary.total} total` },
    { label: 'Scheduled',       value: summary.scheduled,  sub: 'future date set' },
    { label: 'Pending Date',    value: summary.pending,    sub: 'no date yet' },
    { label: 'Late',            value: summary.late,       sub: 'past date, open',      color: 'text-danger' },
    { label: 'On-Time Rate',    value: `${summary.onTimeRate}%`, sub: 'of completed',    color: summary.onTimeRate >= 80 ? 'text-success' : summary.onTimeRate >= 60 ? 'text-warning' : 'text-danger' },
    { label: 'Early',           value: summary.early,      sub: 'finished ahead',       color: 'text-success' },
    { label: 'On Time',         value: summary.onTime,     sub: 'finished on day',      color: 'text-success' },
    { label: 'Failed',          value: summary.failed,     sub: 'late or rescheduled',  color: 'text-danger' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-slate-card border border-white/5 rounded-2xl p-5">
          <div className="text-white/50 text-xs uppercase tracking-wider font-medium">{c.label}</div>
          <div className={`text-3xl font-bold mt-2 tabular-nums ${c.color || 'text-white'}`}>{c.value}</div>
          <div className="text-white/40 text-xs mt-1">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
