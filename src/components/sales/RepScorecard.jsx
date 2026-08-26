import React, { useMemo, useState, useEffect } from 'react';

/* ── Formatting helpers ─────────────────────────────────── */

function fmtCurrency(v) {
  if (v == null) return '$0';
  return `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtTime(minutes) {
  if (minutes == null) return '—';
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtPercent(v) {
  if (v == null) return '0%';
  return `${v}%`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function fmtShortDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function responseTimeColor(minutes) {
  if (minutes == null) return 'text-gray-400';
  if (minutes <= 5) return 'text-success';
  if (minutes <= 60) return 'text-warning';
  if (minutes <= 240) return 'text-orange-400';
  return 'text-danger';
}

function truncate(str, len = 28) {
  if (!str) return '—';
  return str.length > len ? `${str.slice(0, len)}...` : str;
}

/* ── Stat module card ───────────────────────────────────── */

function StatModule({ label, value, valueClass, subline, subline2 }) {
  return (
    <div className="bg-black/[0.03] rounded-xl p-6 flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
        {label}
      </span>
      <span className={`text-4xl font-bold tabular-nums ${valueClass || 'text-gray-900'}`}>
        {value}
      </span>
      {subline && (
        <span className="text-sm text-gray-400">{subline}</span>
      )}
      {subline2 && (
        <span className="text-xs text-gray-300">{subline2}</span>
      )}
    </div>
  );
}

/* ── Status badge ───────────────────────────────────────── */

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

/* ── Time-grouping logic ────────────────────────────────── */

function getWeekNumber(date, monthStart) {
  const diff = date.getTime() - monthStart.getTime();
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}

function getDayLabel(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getMonthLabel(date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getShortMonthLabel(date) {
  return date.toLocaleDateString('en-US', { month: 'short' });
}

function groupDealsByPeriod(deals, period) {
  if (!deals || deals.length === 0) return [];

  // Use createdate for grouping
  const withDates = deals.map((d) => ({
    ...d,
    _date: new Date(d.createdate || d.closedate || Date.now()),
  }));

  // Sort newest first within each group
  withDates.sort((a, b) => b._date - a._date);

  if (period === 'week' || period === 'lastweek') {
    // Group by day
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
    // Group by week of month
    const allDates = withDates.map((d) => d._date);
    const earliest = new Date(Math.min(...allDates));
    const monthStart = new Date(earliest.getFullYear(), earliest.getMonth(), 1);

    const groups = new Map();
    for (const d of withDates) {
      const weekNum = getWeekNumber(d._date, monthStart);
      const key = `week-${weekNum}`;
      if (!groups.has(key)) {
        const weekStart = new Date(monthStart.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
        const label = `Week ${weekNum}`;
        const sub = `${fmtShortDate(weekStart.toISOString())} – ${fmtShortDate(weekEnd.toISOString())}`;
        groups.set(key, { key, label, sublabel: sub, deals: [], weekNum });
      }
      groups.get(key).deals.push(d);
    }
    return [...groups.values()].sort((a, b) => b.weekNum - a.weekNum);
  }

  if (period === 'quarter' || period?.startsWith('q')) {
    // Group by month
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
    // Group by week, with day sub-groups inside
    const groups = new Map();
    const allDates = withDates.map((d) => d._date);
    const earliest = new Date(Math.min(...allDates));
    const baseMonday = new Date(earliest);
    const dayOfWeek = baseMonday.getDay();
    baseMonday.setDate(baseMonday.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

    for (const d of withDates) {
      const diffDays = Math.floor((d._date - baseMonday) / (24 * 60 * 60 * 1000));
      const weekNum = Math.floor(diffDays / 7) + 1;
      const weekKey = `week-${weekNum}`;
      const dayKey = d._date.toISOString().slice(0, 10);

      if (!groups.has(weekKey)) {
        const weekStart = new Date(baseMonday.getTime() + (weekNum - 1) * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
        groups.set(weekKey, {
          key: weekKey,
          label: `Week ${weekNum}`,
          sublabel: `${fmtShortDate(weekStart.toISOString())} – ${fmtShortDate(weekEnd.toISOString())}`,
          deals: [],
          subGroups: new Map(),
          weekNum,
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
      .map((g) => ({
        ...g,
        subGroups: [...g.subGroups.values()].sort((a, b) => b.key.localeCompare(a.key)),
      }));
  }

  // Default (today, custom): group by day
  const groups = new Map();
  for (const d of withDates) {
    const key = d._date.toISOString().slice(0, 10);
    const label = getDayLabel(d._date);
    if (!groups.has(key)) groups.set(key, { key, label, deals: [] });
    groups.get(key).deals.push(d);
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
}

/* ── Deal card (compact) ────────────────────────────────── */

function DealCard({ deal }) {
  const name = truncate(deal.name);
  return (
    <div className="bg-black/[0.02] hover:bg-black/[0.03] rounded-lg px-3 py-2.5 transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {deal.hubspotUrl ? (
            <a href={deal.hubspotUrl} target="_blank" rel="noopener noreferrer"
              className="text-sm text-gray-700 hover:text-accent transition-colors block truncate" title={deal.name}>
              {name}
            </a>
          ) : (
            <span className="text-sm text-gray-700 block truncate" title={deal.name}>{name}</span>
          )}
          <span className="text-[10px] text-gray-300 block mt-0.5">
            {deal.stageLabel || deal.stage || '—'}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {(deal.amount > 0) && (
            <span className="text-sm font-semibold tabular-nums text-white/90">{fmtCurrency(deal.amount)}</span>
          )}
          <StatusBadge status={deal.status} />
        </div>
      </div>
    </div>
  );
}

/* ── Time-grouped column ────────────────────────────────── */

function TimeColumn({ group }) {
  const wonCount = group.deals.filter((d) => d.status === 'won').length;
  const totalAmount = group.deals.reduce((s, d) => s + (d.amount || 0), 0);

  return (
    <div className="bg-black/[0.03] rounded-xl overflow-hidden flex-1 min-w-[280px]">
      {/* Column header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-gray-900">{group.label}</span>
            {group.sublabel && (
              <span className="text-[10px] text-gray-300 block mt-0.5">{group.sublabel}</span>
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

      {/* Deal cards */}
      <div className="p-2 flex flex-col gap-1.5 max-h-[400px] overflow-y-auto">
        {group.subGroups ? (
          // Two-weeks mode: sub-group by day inside each week
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

/* ── Main component ─────────────────────────────────────── */

export default function RepScorecard({ reps, selectedRepId, onSelectRep, periodDeals, period }) {
  const rep = useMemo(
    () => (reps || []).find((r) => r.id === selectedRepId) || null,
    [reps, selectedRepId],
  );

  const repDeals = useMemo(() => {
    if (!periodDeals || !rep) return [];
    return periodDeals.filter((d) => d.ownerId === rep.id);
  }, [periodDeals, rep]);

  const timeGroups = useMemo(
    () => groupDealsByPeriod(repDeals, period),
    [repDeals, period],
  );

  const dealsLoading = rep && (!periodDeals || periodDeals.length === 0) && (rep.bidsSent > 0 || rep.dealsWon > 0);

  // Reset when rep changes
  useEffect(() => {}, [selectedRepId]);

  if (!reps || reps.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <p className="text-gray-400 text-sm text-center">No rep data available.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Rep pills ──────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {reps.map((r) => {
          const isActive = r.id === selectedRepId;
          return (
            <button
              key={r.id}
              onClick={() => onSelectRep(r.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent text-white'
                  : 'bg-black/[0.03] text-gray-500 hover:bg-black/[0.05]'
              }`}
            >
              {r.name}
            </button>
          );
        })}
      </div>

      {/* ── Placeholder when nothing selected ──────── */}
      {!rep && (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 flex items-center justify-center">
          <p className="text-gray-300 text-sm">Select a rep to view their scorecard</p>
        </div>
      )}

      {/* ── Scorecard content ──────────────────────── */}
      {rep && (
        <>
          {/* Stat modules grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatModule
              label="BIDS SENT"
              value={rep.bidsSent ?? 0}
              valueClass="text-accent"
              subline={`${rep.samePeriodBidsSent ?? 0} same-period`}
              subline2="Deals created & bid sent in this period"
            />
            <StatModule
              label="LEADS GENERATED"
              value={rep.leadsAssigned ?? 0}
              subline={`${rep.fbLeads ?? 0} FB / ${rep.organicLeads ?? 0} Organic / ${rep.referralLeads ?? 0} Referral / ${rep.coldLeads ?? 0} Cold`}
              subline2={`${rep.contactsAssigned ?? 0} total contacts`}
            />
            <StatModule
              label="DEALS WON"
              value={rep.dealsWon ?? 0}
              valueClass={(rep.dealsWon ?? 0) > 0 ? 'text-success' : 'text-gray-900'}
              subline={`${rep.dealsCreated ?? 0} created in period`}
            />
            <StatModule
              label="REVENUE CLOSED"
              value={fmtCurrency(rep.revenueClosed)}
              valueClass="text-success"
              subline={`Avg deal: ${fmtCurrency(rep.cohortAvgDealSize || rep.activityAvgDealSize)}`}
            />
            <StatModule
              label="AVG RESPONSE TIME"
              value={fmtTime(rep.avgResponseMinutes)}
              valueClass={responseTimeColor(rep.avgResponseMinutes)}
              subline="From lead creation to first contact"
            />
            <StatModule
              label="CONVERSION RATE"
              value={fmtPercent(rep.conversionRate)}
              subline={`Win rate: ${fmtPercent(rep.cohortWinRate)}`}
              subline2={`${rep.cohortDeals ?? 0} deals from ${rep.leadsAssigned ?? 0} leads`}
            />
          </div>

          {/* ── Bid pipeline bar ───────────────────── */}
          <div className="bg-black/[0.03] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-gray-600 font-medium">
              Bid Pipeline: <span className="text-accent font-bold">{fmtCurrency(rep.bidsRevenue)}</span>
            </span>
            <span className="text-sm text-gray-400">
              Avg Lead → Bid: <span className="text-gray-600 tabular-nums font-medium">{fmtTime(rep.avgTimeToBidMinutes)}</span>
            </span>
          </div>

          {/* ── Deals loading state ────────────────── */}
          {dealsLoading && (
            <div className="bg-black/[0.03] rounded-xl p-8 flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-400 text-sm">Loading deal details...</span>
            </div>
          )}

          {/* ── Time-grouped deal columns ──────────── */}
          {timeGroups.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs uppercase tracking-wider text-gray-300 font-medium">
                  {repDeals.length} Deals · Grouped by {
                    period === 'week' || period === 'lastweek' ? 'Day' :
                    period === 'month' || period === 'lastmonth' ? 'Week' :
                    period === 'quarter' || period?.startsWith('q') ? 'Month' :
                    period === 'twoweeks' ? 'Week' : 'Day'
                  }
                </span>
                <span className="text-xs text-gray-300">
                  {fmtCurrency(repDeals.reduce((s, d) => s + (d.amount || 0), 0))} total pipeline
                </span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {timeGroups.map((group) => (
                  <TimeColumn key={group.key} group={group} />
                ))}
              </div>
            </div>
          )}

          {/* ── No deals message ───────────────────── */}
          {!dealsLoading && repDeals.length === 0 && (
            <div className="bg-black/[0.03] rounded-xl p-8 text-center">
              <p className="text-gray-300 text-sm">No deals found for this period</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
