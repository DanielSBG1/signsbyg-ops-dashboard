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
    { label: 'Total New Leads', value: summary.totalLeads, trend: summary.trends.totalLeads,
      tooltip: 'All contacts created in this period (any lifecycle stage, including qualified)' },
    { label: 'Facebook Leads', value: summary.facebookLeads, trend: summary.trends.facebookLeads,
      tooltip: 'Contacts with original source = Facebook/Paid Social' },
    { label: 'Other Sources', value: summary.otherLeads, trend: summary.trends.otherLeads,
      tooltip: 'All non-Facebook contacts in this period' },
    { label: 'Deal Activity', value: summary.conversionRate, trend: summary.trends.conversionRate, format: 'percent',
      tooltip: 'Throughput ratio: deals created in period ÷ contacts created in period. Measures pipeline velocity, NOT cohort conversion (deals can come from contacts outside this period). For true lead-to-deal trace, see the Conversion Funnel below.' },
    { label: 'Deals Won', value: summary.dealsWon, trend: summary.trends.dealsWon,
      tooltip: 'Deals with closedate in this period and stage = closed-won' },
    { label: 'Revenue Closed', value: summary.revenueClosed, trend: summary.trends.revenueClosed, format: 'currency',
      tooltip: 'Sum of amounts on deals closed-won in this period' },
  ].map((c) => ({ ...c, compareLabel }));

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((c) => (
        <Card key={c.label} {...c} />
      ))}
    </div>
  );
}
