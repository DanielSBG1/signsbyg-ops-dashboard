import React, { useState } from 'react';

const SORT_OPTIONS = [
  { key: 'revenueClosed', label: 'Revenue' },
  { key: 'leadsAssigned', label: 'Leads' },
  { key: 'dealsWon', label: 'Won' },
  { key: 'conversionRate', label: 'Conv %' },
  { key: 'avgResponseMinutes', label: 'Resp Time', ascending: true },
];

function fmt(v, key) {
  if (v == null || v === undefined) return '—';
  if (key === 'revenueClosed' || key === 'cohortRevenue' || key === 'activityRevenue' || key === 'cohortAvgDealSize')
    return `$${Number(v).toLocaleString()}`;
  if (key === 'avgResponseMinutes') {
    if (v == null) return '—';
    if (v < 60) return `${v}m`;
    return `${Math.floor(v / 60)}h ${v % 60}m`;
  }
  if (key === 'conversionRate' || key === 'cohortWinRate' || key === 'activityWinRate')
    return v == null ? '—' : `${v}%`;
  return Number(v).toLocaleString();
}

function primaryLabel(rep, sortKey) {
  const v = rep[sortKey];
  if (sortKey === 'avgResponseMinutes') return fmt(v, 'avgResponseMinutes');
  if (sortKey === 'revenueClosed') return fmt(v, 'revenueClosed');
  if (sortKey === 'conversionRate') return fmt(v, 'conversionRate');
  return v ?? 0;
}

function StatRow({ label, value }) {
  return (
    <>
      <span className="text-white/40">{label}</span>
      <span className="text-white/90 tabular-nums font-medium text-right">{value}</span>
    </>
  );
}

export default function Leaderboard({ reps, onRepClick, selectedRep }) {
  const [sortKey, setSortKey] = useState('revenueClosed');
  const [hoveredId, setHoveredId] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  if (!reps || reps.length === 0) {
    return (
      <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-2">Sales Rep Leaderboard</h2>
        <p className="text-white/40 text-sm">No rep activity in this period yet.</p>
      </div>
    );
  }

  const sortOpt = SORT_OPTIONS.find((o) => o.key === sortKey);

  const sorted = [...reps].sort((a, b) => {
    const av = a[sortKey] ?? (sortOpt?.ascending ? Infinity : 0);
    const bv = b[sortKey] ?? (sortOpt?.ascending ? Infinity : 0);
    return sortOpt?.ascending ? av - bv : bv - av;
  });

  const validVals = sorted.map((r) => r[sortKey] ?? 0).filter((v) => isFinite(v) && v >= 0);
  const maxVal = Math.max(...validVals, 1);

  const avgRevenue = reps.reduce((s, r) => s + r.revenueClosed, 0) / reps.length;

  function barColor(rep) {
    if (sortKey === 'avgResponseMinutes') {
      const m = rep.avgResponseMinutes;
      if (m == null) return 'bg-white/15';
      if (m <= 5) return 'bg-amber-400';    // gold — perfect
      if (m <= 60) return 'bg-success';     // green — good
      if (m <= 240) return 'bg-orange-400'; // orange — slow
      return 'bg-danger';                   // red — terrible
    }
    if (rep.revenueClosed > avgRevenue * 1.2) return 'bg-success';
    if (rep.revenueClosed < avgRevenue * 0.5 && rep.leadsAssigned > 0) return 'bg-danger';
    return 'bg-accent';
  }

  const MEDALS = ['🥇', '🥈', '🥉'];
  const hoveredRep = hoveredId ? sorted.find((r) => r.id === hoveredId) : null;

  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold">Sales Rep Leaderboard</h2>
        <div className="flex items-center gap-1.5">
          <span className="text-white/30 text-xs mr-1">Sort:</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortKey(opt.key)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                sortKey === opt.key
                  ? 'bg-accent text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Rep rows */}
      <div className="space-y-0.5">
        {sorted.map((rep, idx) => {
          const rawVal = rep[sortKey] ?? 0;
          // Ascending sorts (resp time): invert bar so lower value = fuller bar = better
          const barPct = maxVal > 0
            ? sortOpt?.ascending
              ? (1 - Math.min(rawVal, maxVal) / maxVal) * 100
              : (Math.min(rawVal, maxVal) / maxVal) * 100
            : 0;
          const isSelected = selectedRep === rep.id;
          const color = barColor(rep);

          return (
            <div
              key={rep.id}
              onClick={() => onRepClick?.(rep.id === selectedRep ? null : rep.id, sortKey)}
              onMouseEnter={(e) => {
                setHoveredId(rep.id);
                setTooltipPos({ x: e.clientX, y: e.clientY });
              }}
              onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHoveredId(null)}
              className={`group relative rounded-lg px-3 py-2 cursor-pointer transition-all duration-150 ${
                isSelected
                  ? 'bg-accent/15 ring-1 ring-accent/40'
                  : 'bg-white/[0.03] hover:bg-white/[0.07]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {/* Rank badge */}
                <div className="w-6 shrink-0 text-center">
                  {idx < 3 ? (
                    <span className="text-base leading-none">{MEDALS[idx]}</span>
                  ) : (
                    <span className="text-white/20 text-[10px] font-mono">#{idx + 1}</span>
                  )}
                </div>

                {/* Left: name + stats */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white/60 truncate leading-none mb-1.5">{rep.name}</div>
                  {/* Bar */}
                  <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${color}`}
                      style={{ width: `${Math.max(barPct, barPct > 0 ? 1.5 : 0)}%` }}
                    />
                  </div>
                  {/* Quick stats */}
                  <div className="flex items-center gap-x-2 mt-1 text-[10px] text-white/25 leading-none">
                    <span><span className="text-white/45">{rep.leadsAssigned}</span>L</span>
                    <span><span className="text-white/45">{rep.dealsCreated}</span>D</span>
                    <span><span className="text-white/45">{rep.dealsWon}</span>W</span>
                    {sortKey !== 'conversionRate' && <span><span className="text-white/45">{fmt(rep.conversionRate, 'conversionRate')}</span></span>}
                    {rep.avgResponseMinutes != null && sortKey !== 'avgResponseMinutes' && (
                      <span><span className="text-white/45">{fmt(rep.avgResponseMinutes, 'avgResponseMinutes')}</span></span>
                    )}
                  </div>
                </div>

                {/* Right: BIG number */}
                <div className="shrink-0 text-right">
                  <span className="text-xl font-bold tabular-nums text-white leading-none">
                    {primaryLabel(rep, sortKey)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hover tooltip — rendered in a portal-like fixed position */}
      {hoveredRep && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: tooltipPos.x > window.innerWidth / 2 ? tooltipPos.x - 272 : tooltipPos.x + 16,
            top: Math.min(tooltipPos.y - 8, window.innerHeight - 360),
          }}
        >
          <div className="w-64 bg-[#1a2035] border border-white/10 rounded-xl p-4 shadow-2xl text-sm">
            <div className="font-semibold mb-3 text-white">{hoveredRep.name}</div>

            <div className="space-y-3">
              <section>
                <p className="text-white/30 text-[10px] uppercase tracking-widest mb-1.5">Lead Activity</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <StatRow label="Leads Assigned" value={hoveredRep.leadsAssigned} />
                  <StatRow label="FB Leads" value={hoveredRep.fbLeads} />
                  <StatRow label="Organic" value={hoveredRep.organicLeads} />
                  <StatRow label="Referral" value={hoveredRep.referralLeads} />
                </div>
              </section>

              <section>
                <p className="text-white/30 text-[10px] uppercase tracking-widest mb-1.5">Deal Activity</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <StatRow label="Deals Created" value={hoveredRep.dealsCreated} />
                  <StatRow label="Deals Won" value={hoveredRep.dealsWon} />
                  <StatRow label="Revenue" value={fmt(hoveredRep.revenueClosed, 'revenueClosed')} />
                  <StatRow label="Conv Rate" value={fmt(hoveredRep.conversionRate, 'conversionRate')} />
                  <StatRow label="Win Rate" value={fmt(hoveredRep.cohortWinRate, 'cohortWinRate')} />
                  <StatRow
                    label="Avg Deal Size"
                    value={hoveredRep.cohortAvgDealSize ? fmt(hoveredRep.cohortAvgDealSize, 'cohortAvgDealSize') : '—'}
                  />
                </div>
              </section>

              <section>
                <p className="text-white/30 text-[10px] uppercase tracking-widest mb-1.5">Speed to Lead</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <StatRow label="Avg Response" value={fmt(hoveredRep.avgResponseMinutes, 'avgResponseMinutes')} />
                  <StatRow label="Cohort Won" value={hoveredRep.cohortWon} />
                </div>
              </section>
            </div>

            <div className="mt-3 pt-3 border-t border-white/8 text-[10px] text-white/25 text-center">
              Click to filter leads ↓
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
