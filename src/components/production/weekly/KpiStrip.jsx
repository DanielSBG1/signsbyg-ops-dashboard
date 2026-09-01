import React from 'react';

function KpiCard({ label, value, sub, color, icon, active, onClick }) {
  const colorMap = {
    success: 'text-success',
    danger:  'text-danger',
    warning: 'text-warning',
    orange:  'text-orange-400',
  };
  const cls = colorMap[color] ?? 'text-gray-900';
  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white border rounded-2xl p-6 transition-all duration-150 ${
        active
          ? 'border-accent/60 ring-1 ring-accent/30 bg-accent/[0.04]'
          : 'border-gray-200 hover:border-gray-200'
      }`}
    >
      <p className="text-gray-500 text-[11px] font-semibold uppercase tracking-widest mb-3">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className={`text-5xl font-bold tabular-nums leading-none ${cls}`}>{value ?? '\u2014'}</p>
        {icon && <span className="text-2xl leading-none">{icon}</span>}
      </div>
      {sub && <p className="text-gray-500 text-xs mt-2">{sub}</p>}
      <p className={`text-[10px] mt-3 transition-colors ${active ? 'text-accent' : 'text-gray-500'}`}>
        {active ? 'Click to collapse \u2191' : 'Click to see jobs \u2193'}
      </p>
    </button>
  );
}

/**
 * KpiStrip \u2014 the 5-card (+ optional staging card) KPI row.
 *
 * Props:
 *   scheduledTotal         {number}
 *   onTimeTotal            {number}
 *   completedLateTotal     {number}
 *   atRiskTotal            {number}
 *   rescheduledInPeriod    {Array}
 *   stagedJobs             {Array}
 *   rescheduledThisWeek    {number}
 *   activeCard             {string|null}
 *   onToggleCard           {(card: string) => void}
 */
export default function KpiStrip({
  scheduledTotal,
  onTimeTotal,
  completedLateTotal,
  atRiskTotal,
  rescheduledInPeriod,
  stagedJobs,
  rescheduledThisWeek,
  activeCard,
  onToggleCard,
}) {
  return (
    <div className="grid grid-cols-5 gap-4">
      <KpiCard
        label="Jobs Scheduled"
        value={scheduledTotal}
        sub="total jobs in period"
        active={activeCard === 'scheduled'}
        onClick={() => onToggleCard('scheduled')}
      />
      <KpiCard
        label="On Time"
        value={onTimeTotal}
        sub="completed on schedule"
        color="success"
        icon={onTimeTotal > 0 ? '\u2713' : undefined}
        active={activeCard === 'onTime'}
        onClick={() => onToggleCard('onTime')}
      />
      <KpiCard
        label="Completed Late"
        value={completedLateTotal}
        sub="finished after due date"
        color={completedLateTotal > 0 ? 'danger' : undefined}
        active={activeCard === 'completedLate'}
        onClick={() => onToggleCard('completedLate')}
      />
      <KpiCard
        label="At Risk"
        value={atRiskTotal}
        sub="overdue or behind schedule"
        color={atRiskTotal > 0 ? 'orange' : undefined}
        active={activeCard === 'atRisk'}
        onClick={() => onToggleCard('atRisk')}
      />
      <KpiCard
        label="Rescheduled"
        value={rescheduledInPeriod.length}
        sub={`${rescheduledThisWeek ?? 0} new this week`}
        color={rescheduledInPeriod.length > 0 ? 'warning' : undefined}
        active={activeCard === 'rescheduled'}
        onClick={() => onToggleCard('rescheduled')}
      />
      {(stagedJobs?.length ?? 0) > 0 && (
        <KpiCard
          label="In Staging"
          value={stagedJobs.length}
          sub="ready for installation"
          color="success"
          icon="\ud83d\udce6"
        />
      )}
    </div>
  );
}
