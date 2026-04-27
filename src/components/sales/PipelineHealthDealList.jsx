import React, { useState } from 'react';

const REASON_LABELS = {
  hot_stage: 'hot stage',
  velocity: 'velocity 🚀',
  stuck_pre_design: 'pre-design 🔝',
  hot_stage_decayed: 'hot decayed',
  velocity_decayed: 'velocity decayed',
  age_threshold: 'age (>100%)',
  too_old: 'too old',
  normal: '',
};

function formatMoney(amount) {
  if (!amount) return '$0';
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  return `$${Math.round(amount)}`;
}

/**
 * Per-pipeline-grouped deal list. Used in HOT, AGING, COLD, NEW DEALS sections.
 *
 * Props:
 *   pipelines: { retail: { label, deals: [] }, gc: ..., ... }
 *     Each pipeline includes its label and an array of deals to display.
 *     Empty pipelines are skipped (not rendered).
 *   columns: array of { key, label, render? } describing which columns to show
 *     render(deal) returns the cell content; if omitted, uses deal[key]
 *   emptyMessage: string shown if ALL pipelines have 0 deals
 */
export default function PipelineHealthDealList({ pipelines, columns, emptyMessage, onDealClick }) {
  // null = use the default order from the API (no client-side sort)
  const [sort, setSort] = useState(null); // { key, dir }

  function handleHeaderClick(key) {
    if (!sort || sort.key !== key) {
      setSort({ key, dir: 'asc' });
    } else if (sort.dir === 'asc') {
      setSort({ key, dir: 'desc' });
    } else {
      setSort(null); // third click clears sort and restores default order
    }
  }

  function sortDeals(deals) {
    if (!sort) return deals;
    const copy = [...deals];
    copy.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sort.dir === 'asc' ? av - bv : bv - av;
      }
      return sort.dir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  }

  const nonEmpty = Object.entries(pipelines).filter(([, p]) => p.deals.length > 0);

  if (nonEmpty.length === 0) {
    return (
      <p className="text-white/30 text-sm text-center py-6">{emptyMessage || 'No deals.'}</p>
    );
  }

  return (
    <div className="space-y-6">
      {nonEmpty.map(([key, p]) => {
        const subtotal = p.deals.reduce((s, d) => s + (d.amount || 0), 0);
        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-white/80">{p.label}</h4>
              <span className="text-xs text-white/40">
                {p.deals.length} {p.deals.length === 1 ? 'deal' : 'deals'} · {formatMoney(subtotal)}
              </span>
            </div>
            <div className="bg-white/5 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-white/5 text-white/40 uppercase text-[10px] tracking-wider">
                  <tr>
                    {columns.map((col) => {
                      const isActive = sort && sort.key === col.key;
                      return (
                        <th
                          key={col.key}
                          onClick={() => handleHeaderClick(col.key)}
                          className="px-3 py-2 text-left font-medium cursor-pointer select-none hover:text-white/70"
                        >
                          {col.label}
                          {isActive && (
                            <span className="ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortDeals(p.deals).map((deal) => {
                    // Hot deals stuck in their HubSpot hot stage > 20 days are stale —
                    // they should be closing but aren't. Highlight red.
                    const isStaleHot = deal.reason === 'hot_stage' && (deal.stageAgeDays || 0) > 20;
                    return (
                      <tr
                        key={deal.id}
                        onClick={() => onDealClick?.(deal)}
                        className={`border-t border-white/5 ${onDealClick ? 'cursor-pointer' : ''} ${
                          isStaleHot
                            ? 'bg-red-500/20 hover:bg-red-500/30 border-red-500/40'
                            : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        {columns.map((col) => (
                          <td key={col.key} className="px-3 py-2 text-white/70">
                            {col.render ? col.render(deal) : deal[col.key]}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { REASON_LABELS, formatMoney };
