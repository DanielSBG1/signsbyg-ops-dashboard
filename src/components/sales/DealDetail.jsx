import React, { useState } from 'react';

function formatMoney(amount) {
  if (!amount) return '$0';
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${Math.round(amount)}`;
}

const STATUS_STYLES = {
  open: 'bg-blue-500/20 text-blue-300',
  won: 'bg-green-500/20 text-green-300',
  lost: 'bg-red-500/20 text-red-300',
};

/**
 * Shown when the user clicks a Deals or Won count in the funnel.
 * Lists the actual deals belonging to the cohort, with stage info.
 */
export default function DealDetail({ cohortDeals, cohortLoading, periodDeals, funnelFilter, repFilter, repName, onClearFunnelFilter, onClearRepFilter }) {
  const [sortKey, setSortKey] = useState('createdate');
  const [sortDir, setSortDir] = useState('desc');

  if (!funnelFilter && !repFilter) return null;

  // Pick the right dataset based on the view that triggered the click:
  // - 'rep_activity' / 'source_activity': uses periodDeals (period-based)
  // - 'rep_funnel' / 'source': uses cohortDeals (cohort-based)
  // - cohortFallback: cohortDeals is empty (month+ period skips contact fetches),
  //   so fall back to periodDeals with deal-level source filter (source view only).
  //   NOTE: rep_funnel view cannot fall back because cohortWon tracks contacts→customers
  //   (requires association map), which is different from deals closed in the period.
  // Rep-filter mode (clicked leaderboard rep in deals-sort) — no funnelFilter active
  const isRepFilterMode = !!repFilter && !funnelFilter;

  const isActivity = !isRepFilterMode && (funnelFilter.view === 'rep_activity' || funnelFilter.view === 'source_activity');
  const cohortDealsEmpty = (cohortDeals || []).length === 0;
  const repCohortUnavailable = !isRepFilterMode && !isActivity && funnelFilter.view === 'rep_funnel' && cohortDealsEmpty;
  const cohortFallback = !isRepFilterMode && !isActivity && !repCohortUnavailable && cohortDealsEmpty && (periodDeals || []).length > 0;
  const useActivityLogic = isActivity || cohortFallback;

  // In rep-filter mode: always use periodDeals filtered by deal ownerId.
  // cohortDeals tracks contact ownership (contactRepId), not deal ownership,
  // so it can return wrong deals (e.g. contact owned by rep A, deal owned by rep B).
  // The leaderboard revenue/won numbers come from deal ownership, so periodDeals matches.
  const source = isRepFilterMode
    ? (periodDeals || [])
    : useActivityLogic ? (periodDeals || []) : (cohortDeals || []);

  // Rep-cohort data arrives via a parallel /api/sales-cohort-deals fetch.
  // While it's loading show a skeleton; if it fails/isn't available show guidance.
  if (repCohortUnavailable) {
    return (
      <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h2 className="text-lg font-semibold">Deal Details</h2>
          {funnelFilter && (
            <button onClick={onClearFunnelFilter} className="px-3 py-1 text-xs rounded-full bg-accent/20 text-accent hover:bg-accent/30 transition-colors">
              {funnelFilter.label} · {funnelFilter.row} &times;
            </button>
          )}
        </div>
        {cohortLoading ? (
          <div className="space-y-2 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 bg-white/5 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 space-y-2">
            <p className="text-white/60 text-sm">
              Contact-level deal attribution isn't available for periods longer than 2 weeks.
            </p>
            <p className="text-white/40 text-xs">
              Switch to <span className="text-accent">By Rep — Activity</span> view to see individual deals for this period.
            </p>
          </div>
        )}
      </div>
    );
  }

  let filtered = source;

  if (isRepFilterMode) {
    // Rep-filter mode: show all deals owned by this rep (deal owner, not contact owner)
    filtered = filtered.filter((d) => d.ownerId === repFilter);
  } else {
    // Funnel-filter mode (original logic)
    if (funnelFilter.type === 'source') {
      if (useActivityLogic) {
        filtered = filtered.filter((d) => (d.source || d.contactSource) === funnelFilter.key);
      } else {
        filtered = filtered.filter((d) => d.contactSource === funnelFilter.key);
      }
    } else if (funnelFilter.type === 'rep') {
      if (useActivityLogic) {
        filtered = filtered.filter((d) => d.ownerId === funnelFilter.key);
      } else {
        filtered = filtered.filter((d) => d.contactRepId === funnelFilter.key);
      }
    }
    if (funnelFilter.row === 'won') {
      filtered = filtered.filter((d) => d.status === 'won');
      if (useActivityLogic) filtered = filtered.filter((d) => d.closedInPeriod);
    } else if (funnelFilter.row === 'decided') {
      filtered = filtered.filter((d) => d.status === 'won' || d.status === 'lost');
      if (useActivityLogic) filtered = filtered.filter((d) => d.closedInPeriod);
    } else if (funnelFilter.row === 'deals' && useActivityLogic) {
      filtered = filtered.filter((d) => d.createdInPeriod);
    }
  }
  // For rep_funnel + row === 'deals' (cohort mode): show all statuses from cohort

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
    return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  function handleSort(key) {
    if (sortKey === key) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-semibold">Deal Details</h2>
          <span className="text-white/40 text-sm">{filtered.length} showing</span>
          {cohortFallback && (
            <span className="text-yellow-400/70 text-xs bg-yellow-400/10 border border-yellow-400/20 rounded-full px-2 py-0.5">
              ⚠ Contact attribution not available for this period — filtered by deal owner/source
            </span>
          )}
        </div>
        {isRepFilterMode ? (
          <button
            onClick={onClearRepFilter}
            className="px-3 py-1 text-xs rounded-full bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          >
            {repName || 'Rep'} · deals &times;
          </button>
        ) : funnelFilter ? (
          <button
            onClick={onClearFunnelFilter}
            className="px-3 py-1 text-xs rounded-full bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          >
            {funnelFilter.label} · {funnelFilter.row} &times;
          </button>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <p className="text-white/40 text-sm text-center py-6">No deals match this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-xs uppercase tracking-wider">
                {[
                  { key: 'name', label: 'Deal' },
                  { key: 'stageLabel', label: 'Stage' },
                  { key: 'pipelineLabel', label: 'Pipeline' },
                  { key: 'status', label: 'Status' },
                  { key: 'amount', label: 'Amount', align: 'right' },
                  { key: 'ownerName', label: 'Owner' },
                  { key: 'createdate', label: 'Created', align: 'right' },
                  { key: 'hubspotUrl', label: '', align: 'center' },
                ].map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`pb-3 px-3 cursor-pointer hover:text-white/70 transition-colors ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {col.label}
                    {sortKey === col.key && <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((d) => (
                <tr key={d.id} className="hover:bg-white/5 transition-colors border-t border-white/5">
                  <td className="py-3 px-3 text-left font-medium">{d.name}</td>
                  <td className="py-3 px-3 text-left text-white/70">{d.stageLabel}</td>
                  <td className="py-3 px-3 text-left text-white/60 text-xs">{d.pipelineLabel}</td>
                  <td className="py-3 px-3 text-left">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[d.status] || ''}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums">{formatMoney(d.amount)}</td>
                  <td className="py-3 px-3 text-left text-white/80">{d.ownerName}</td>
                  <td className="py-3 px-3 text-right tabular-nums text-white/60 text-xs">
                    {d.createdate ? new Date(d.createdate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td className="py-3 px-2 text-center">
                    {d.hubspotUrl && (
                      <a
                        href={d.hubspotUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/30 hover:text-accent transition-colors text-sm"
                        onClick={(e) => e.stopPropagation()}
                        title="Open in HubSpot"
                      >
                        ↗
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
