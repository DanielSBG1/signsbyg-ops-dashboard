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
export default function DealDetail({ cohortDeals, periodDeals, funnelFilter, onClearFunnelFilter }) {
  const [sortKey, setSortKey] = useState('createdate');
  const [sortDir, setSortDir] = useState('desc');

  if (!funnelFilter) return null;

  // Pick the right dataset based on the view that triggered the click:
  // - 'rep_activity' / 'source_activity': uses periodDeals (period-based)
  // - 'rep_funnel' / 'source': uses cohortDeals (cohort-based)
  const isActivity = funnelFilter.view === 'rep_activity' || funnelFilter.view === 'source_activity';
  const source = isActivity ? (periodDeals || []) : (cohortDeals || []);

  let filtered = source;
  // type='total' = no source/rep filter (show all)
  if (funnelFilter.type === 'source') {
    // For source_activity use the deal's own source, not the contact's
    if (isActivity) {
      filtered = filtered.filter((d) => (d.source || d.contactSource) === funnelFilter.key);
    } else {
      filtered = filtered.filter((d) => d.contactSource === funnelFilter.key);
    }
  } else if (funnelFilter.type === 'rep') {
    if (isActivity) {
      filtered = filtered.filter((d) => d.ownerId === funnelFilter.key);
    } else {
      filtered = filtered.filter((d) => d.contactRepId === funnelFilter.key);
    }
  }
  // Row filters
  if (funnelFilter.row === 'won') {
    filtered = filtered.filter((d) => d.status === 'won');
    if (isActivity) filtered = filtered.filter((d) => d.closedInPeriod);
  } else if (funnelFilter.row === 'decided') {
    filtered = filtered.filter((d) => d.status === 'won' || d.status === 'lost');
    if (isActivity) filtered = filtered.filter((d) => d.closedInPeriod);
  } else if (funnelFilter.row === 'deals' && isActivity) {
    filtered = filtered.filter((d) => d.createdInPeriod);
  }
  // For source/rep_funnel + row === 'deals', show all (open, won, lost) from cohort

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
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Deal Details</h2>
          <span className="text-white/40 text-sm">{filtered.length} showing</span>
        </div>
        {funnelFilter && (
          <button
            onClick={onClearFunnelFilter}
            className="px-3 py-1 text-xs rounded-full bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          >
            {funnelFilter.label} · {funnelFilter.row} &times;
          </button>
        )}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
