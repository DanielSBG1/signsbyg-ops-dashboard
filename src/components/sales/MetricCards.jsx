import React from 'react';

const COMPARE_LABELS = {
  today: 'vs yesterday',
  week: 'vs last week',
  month: 'vs last month',
  quarter: 'vs last quarter',
  q1: 'vs Q1 prior year',
  q2: 'vs Q2 prior year',
  q3: 'vs Q3 prior year',
  q4: 'vs Q4 prior year',
  year: 'vs last year',
  custom: 'vs prior period',
};

function TrendBadge({ value, compareLabel, tooltip }) {
  const isZero = value === 0;
  const isUp = value > 0;
  return (
    <span className="text-xs flex items-center gap-1.5" title={tooltip}>
      {isZero ? (
        <span className="text-white/30">—</span>
      ) : (
        <span className={`font-medium ${isUp ? 'text-success' : 'text-danger'}`}>
          {isUp ? '↑' : '↓'} {Math.abs(value)}%
        </span>
      )}
      <span className="text-white/30">{compareLabel}</span>
    </span>
  );
}

function Card({ label, value, trend, format, compareLabel, tooltip }) {
  let displayValue = value;
  if (format === 'currency') {
    displayValue = `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  } else if (format === 'percent') {
    displayValue = `${value}%`;
  } else {
    displayValue = Number(value).toLocaleString();
  }

  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-5 flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wider text-white/40 font-medium" title={tooltip}>{label}</span>
      <span className="text-3xl font-bold tracking-tight">{displayValue}</span>
      <TrendBadge value={trend} compareLabel={compareLabel} tooltip={tooltip} />
    </div>
  );
}

export default function MetricCards({ summary, period }) {
  if (!summary) return null;
  const compareLabel = COMPARE_LABELS[period] || 'vs prior period';

  const cards = [
    { label: 'Total Leads', value: summary.totalLeads, trend: summary.trends.totalLeads,
      tooltip: 'All contacts created in this period (any lifecycle stage)' },
    { label: 'FB Leads', value: summary.facebookLeads, trend: summary.trends.facebookLeads,
      tooltip: 'Contacts with original source = Facebook/Paid Social' },
    { label: 'Cold Outreach', value: summary.coldOutreachLeads ?? summary.otherLeads, trend: summary.trends.coldOutreachLeads ?? summary.trends.otherLeads,
      tooltip: 'Contacts sourced via email prospecting or cold outreach' },
    { label: 'Deals Won', value: summary.dealsWon, trend: summary.trends.dealsWon,
      tooltip: 'Deals closed-won in this period' },
    { label: 'Deals Sent', value: summary.dealsSent ?? '—', trend: summary.trends.dealsSent ?? 0,
      tooltip: 'Deals created this period currently in Proposal Sent & Awaiting Response stage' },
    { label: 'Deals Created', value: summary.dealsCreated ?? '—', trend: summary.trends.dealsCreated ?? 0,
      tooltip: 'New deals opened in this period' },
    { label: 'Revenue Closed', value: summary.revenueClosed, trend: summary.trends.revenueClosed, format: 'currency',
      tooltip: 'Sum of amounts on deals closed-won in this period' },
  ].map((c) => ({ ...c, compareLabel }));

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
      {cards.map((c) => (
        <Card key={c.label} {...c} />
      ))}
    </div>
  );
}
