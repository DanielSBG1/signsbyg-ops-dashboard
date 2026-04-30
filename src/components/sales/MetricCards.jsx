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

function Card({ label, value, trend, format, compareLabel, tooltip, onClick, isActive }) {
  let displayValue = value;
  if (format === 'currency') {
    displayValue = `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  } else if (format === 'percent') {
    displayValue = `${value}%`;
  } else {
    displayValue = Number(value).toLocaleString();
  }

  return (
    <button
      onClick={onClick}
      className={`bg-slate-card border rounded-2xl p-5 flex flex-col gap-2 text-left w-full transition-all ${
        isActive
          ? 'border-accent/50 ring-1 ring-accent/30 bg-accent/5'
          : 'border-white/5 hover:border-white/15 hover:bg-white/3'
      }`}
    >
      <span className="text-xs uppercase tracking-wider text-white/40 font-medium" title={tooltip}>{label}</span>
      <span className="text-3xl font-bold tracking-tight">{displayValue}</span>
      <TrendBadge value={trend} compareLabel={compareLabel} tooltip={tooltip} />
    </button>
  );
}

// Maps each card's filterKey to the funnelFilter row (determines DealDetail vs LeadDetail)
const CARD_FILTERS = [
  { filterKey: 'totalLeads',    row: 'leads', label: 'Total Leads',    value: (s) => s.totalLeads,                         trend: (s) => s.trends.totalLeads,      tooltip: 'All contacts created in this period (any lifecycle stage)' },
  { filterKey: 'facebookLeads', row: 'leads', label: 'FB Leads',       value: (s) => s.facebookLeads,                      trend: (s) => s.trends.facebookLeads,   tooltip: 'Contacts with original source = Facebook/Paid Social' },
  { filterKey: 'coldOutreach',  row: 'leads', label: 'Cold Outreach',  value: (s) => s.coldOutreachLeads ?? s.otherLeads,  trend: (s) => s.trends.coldOutreachLeads ?? s.trends.otherLeads, tooltip: 'Contacts sourced via email prospecting or cold outreach' },
  { filterKey: 'dealsWon',      row: 'won',   label: 'Deals Won',      value: (s) => s.dealsWon,                           trend: (s) => s.trends.dealsWon,        tooltip: 'Deals closed-won in this period' },
  { filterKey: 'dealsSent',     row: 'sent',  label: 'Deals Sent',     value: (s) => s.dealsSent ?? '—',                  trend: (s) => s.trends.dealsSent ?? 0,  tooltip: 'Deals that entered Proposal Sent & Awaiting Response in this period' },
  { filterKey: 'dealsCreated',  row: 'deals', label: 'Deals Created',  value: (s) => s.dealsCreated ?? '—',               trend: (s) => s.trends.dealsCreated ?? 0, tooltip: 'New deals opened in this period' },
  { filterKey: 'revenueClosed', row: 'won',   label: 'Revenue Closed', value: (s) => s.revenueClosed,                     trend: (s) => s.trends.revenueClosed,   format: 'currency', tooltip: 'Sum of amounts on deals closed-won in this period' },
];

export default function MetricCards({ summary, period, onCardClick, activeCard }) {
  if (!summary) return null;
  const compareLabel = COMPARE_LABELS[period] || 'vs prior period';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
      {CARD_FILTERS.map((c) => (
        <Card
          key={c.filterKey}
          label={c.label}
          value={c.value(summary)}
          trend={c.trend(summary)}
          format={c.format}
          compareLabel={compareLabel}
          tooltip={c.tooltip}
          isActive={activeCard === c.filterKey}
          onClick={() => onCardClick?.({ type: 'metric', key: c.filterKey, row: c.row, label: c.label })}
        />
      ))}
    </div>
  );
}
