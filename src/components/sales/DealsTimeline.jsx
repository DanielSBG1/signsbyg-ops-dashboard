import React, { useMemo } from 'react';

/* ── Helpers ──────────────────────────────────────────────── */

function fmtCurrency(v) {
  if (v == null) return '$0';
  return `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function truncate(str, len = 28) {
  if (!str) return '—';
  return str.length > len ? `${str.slice(0, len)}...` : str;
}

function getDayLabel(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getMonthLabel(date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/* ── Status badge ─────────────────────────────────────────── */

function StatusBadge({ status }) {
  const lower = (status || '').toLowerCase();
  let colorClass = 'bg-accent/20 text-accent';
  let label = 'Open';
  if (lower === 'won' || lower === 'closedwon' || lower === 'closed won') {
    colorClass = 'bg-success/20 text-success';
    label = 'Won';
  } else if (lower === 'lost' || lower === 'closedlost' || lower === 'closed lost') {
    colorClass = 'bg-danger/20 text-danger';
    label = 'Lost';
  }
  return (
    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${colorClass}`}>
      {label}
    </span>
  );
}

/* ── Deal card ────────────────────────────────────────────── */

function DealCard({ deal }) {
  const name = truncate(deal.name);
  return (
    <div className="bg-black/[0.02] hover:bg-gray-100 rounded-lg px-3 py-2.5 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {deal.hubspotUrl ? (
            <a href={deal.hubspotUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-gray-700 hover:text-accent transition-colors block truncate" title={deal.name}>
              {name}
            </a>
          ) : (
            <span className="text-xs text-gray-700 block truncate" title={deal.name}>{name}</span>
          )}
          <span className="text-[10px] text-gray-500 block mt-0.5">
            {deal.stageLabel || deal.stage || '—'}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {(deal.amount > 0) && (
            <span className="text-xs font-semibold tabular-nums text-gray-800">{fmtCurrency(deal.amount)}</span>
          )}
          <StatusBadge status={deal.status} />
        </div>
      </div>
    </div>
  );
}

/* ── Time column ──────────────────────────────────────────── */

function TimeColumn({ group }) {
  const wonCount = group.deals.filter((d) => d.status === 'won').length;
  const totalAmount = group.deals.reduce((s, d) => s + (d.amount || 0), 0);

  return (
    <div className="bg-black/[0.03] rounded-xl overflow-hidden flex-1 min-w-[260px]">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-gray-900">{group.label}</span>
            {group.sublabel && (
              <span className="text-[10px] text-gray-500 block mt-0.5">{group.sublabel}</span>
            )}
          </div>
          <div className="text-right">
            <span className="text-xs tabular-nums text-gray-500">{group.deals.length} deals</span>
            {wonCount > 0 && (
              <span className="text-[10px] text-success block">{wonCount} won</span>
            )}
          </div>
        </div>
        {totalAmount > 0 && (
          <div className="mt-1.5 text-xs font-medium text-accent tabular-nums">{fmtCurrency(totalAmount)}</div>
        )}
      </div>
      <div className="p-2 flex flex-col gap-1.5 max-h-[400px] overflow-y-auto">
        {group.subGroups ? (
          group.subGroups.map((sub) => (
            <div key={sub.key}>
              <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-accent/70 font-semibold border-l-2 border-accent/30 ml-1 mb-1">
                {sub.label} · {sub.deals.length}
              </div>
              {sub.deals.map((deal, idx) => (
                <DealCard key={deal.id || idx} deal={deal} />
              ))}
            </div>
          ))
        ) : (
          group.deals.map((deal, idx) => (
            <DealCard key={deal.id || idx} deal={deal} />
          ))
        )}
      </div>
    </div>
  );
}

/* ── Grouping logic ───────────────────────────────────────── */

export function groupDealsByPeriod(deals, period) {
  if (!deals || deals.length === 0) return [];

  const withDates = deals.map((d) => ({
    ...d,
    _date: new Date(d.createdate || d.closedate || Date.now()),
  }));
  withDates.sort((a, b) => b._date - a._date);

  if (period === 'week' || period === 'lastweek') {
    const groups = new Map();
    for (const d of withDates) {
      const key = d._date.toISOString().slice(0, 10);
      const label = getDayLabel(d._date);
      if (!groups.has(key)) groups.set(key, { key, label, deals: [], subGroups: null });
      groups.get(key).deals.push(d);
    }
    return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
  }

  if (period === 'month' || period === 'lastmonth') {
    // Week 1 = days 1–7, Week 2 = days 8–14, etc.
    const groups = new Map();
    for (const d of withDates) {
      const dayOfMonth = d._date.getDate();
      const weekNum = Math.ceil(dayOfMonth / 7);
      const key = `week-${weekNum}`;
      if (!groups.has(key)) {
        const y = d._date.getFullYear();
        const m = d._date.getMonth();
        const startDay = (weekNum - 1) * 7 + 1;
        const endDay = Math.min(weekNum * 7, new Date(y, m + 1, 0).getDate());
        const weekStart = new Date(y, m, startDay);
        const weekEnd = new Date(y, m, endDay);
        groups.set(key, {
          key,
          label: `Week ${weekNum}`,
          sublabel: `${fmtShortDate(weekStart.toISOString())} – ${fmtShortDate(weekEnd.toISOString())}`,
          deals: [],
          weekNum,
        });
      }
      groups.get(key).deals.push(d);
    }
    return [...groups.values()].sort((a, b) => b.weekNum - a.weekNum);
  }

  if (period === 'quarter' || period?.startsWith('q')) {
    const groups = new Map();
    for (const d of withDates) {
      const key = `${d._date.getFullYear()}-${String(d._date.getMonth() + 1).padStart(2, '0')}`;
      const label = getMonthLabel(d._date);
      if (!groups.has(key)) groups.set(key, { key, label, deals: [] });
      groups.get(key).deals.push(d);
    }
    return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
  }

  if (period === 'twoweeks') {
    const groups = new Map();
    const allDates = withDates.map((d) => d._date);
    const earliest = new Date(Math.min(...allDates));
    const baseMonday = new Date(earliest);
    const dow = baseMonday.getDay();
    baseMonday.setDate(baseMonday.getDate() - (dow === 0 ? 6 : dow - 1));

    for (const d of withDates) {
      const diffDays = Math.floor((d._date - baseMonday) / (24 * 60 * 60 * 1000));
      const weekNum = Math.floor(diffDays / 7) + 1;
      const weekKey = `week-${weekNum}`;
      const dayKey = d._date.toISOString().slice(0, 10);

      if (!groups.has(weekKey)) {
        const weekStart = new Date(baseMonday.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
        groups.set(weekKey, {
          key: weekKey, label: `Week ${weekNum}`,
          sublabel: `${fmtShortDate(weekStart.toISOString())} – ${fmtShortDate(weekEnd.toISOString())}`,
          deals: [], subGroups: new Map(), weekNum,
        });
      }
      const group = groups.get(weekKey);
      group.deals.push(d);
      if (!group.subGroups.has(dayKey)) {
        group.subGroups.set(dayKey, { key: dayKey, label: getDayLabel(d._date), deals: [] });
      }
      group.subGroups.get(dayKey).deals.push(d);
    }

    return [...groups.values()]
      .sort((a, b) => b.weekNum - a.weekNum)
      .map((g) => ({ ...g, subGroups: [...g.subGroups.values()].sort((a, b) => b.key.localeCompare(a.key)) }));
  }

  // Default: group by day
  const groups = new Map();
  for (const d of withDates) {
    const key = d._date.toISOString().slice(0, 10);
    const label = getDayLabel(d._date);
    if (!groups.has(key)) groups.set(key, { key, label, deals: [] });
    groups.get(key).deals.push(d);
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
}

/* ── Main component ───────────────────────────────────────── */

export default function DealsTimeline({ deals, period, repName }) {
  const timeGroups = useMemo(() => groupDealsByPeriod(deals, period), [deals, period]);

  if (!deals || deals.length === 0) return null;

  const groupLabel =
    period === 'week' || period === 'lastweek' ? 'Day' :
    period === 'month' || period === 'lastmonth' ? 'Week' :
    period === 'quarter' || period?.startsWith('q') ? 'Month' :
    period === 'twoweeks' ? 'Week' : 'Day';

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            {repName ? `${repName}'s Deals` : 'Deals'} · Grouped by {groupLabel}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">{deals.length} deals this period</p>
        </div>
        <span className="text-xs text-gray-500 tabular-nums">
          {fmtCurrency(deals.reduce((s, d) => s + (d.amount || 0), 0))} total pipeline
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {timeGroups.map((group) => (
          <TimeColumn key={group.key} group={group} />
        ))}
      </div>
    </div>
  );
}
