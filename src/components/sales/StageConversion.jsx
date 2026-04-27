import React, { useState } from 'react';
import { useStageConversion } from '../../hooks/sales/useStageConversion';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'q1', label: 'Q1' },
  { value: 'q2', label: 'Q2' },
  { value: 'q3', label: 'Q3' },
  { value: 'q4', label: 'Q4' },
  { value: 'custom', label: 'Custom' },
];

const MODE_DESCRIPTIONS = {
  cohort: 'Deals created in the selected period — shown at their current stage.',
  snapshot: 'All open deals right now, regardless of when they were created. Won = this year only.',
};

const PIPELINE_LABELS = {
  retail: 'Retail Commercial',
  gc: 'General Contractors',
  wholesale: 'Wholesale',
  pm: 'Property Managers',
};

const SOURCE_COLORS = {
  facebook: '#3b82f6',
  paid_social_other: '#a855f7',
  paid_search: '#8b5cf6',
  email_extension: '#f59e0b',
  crm_manual: '#ef4444',
  integration: '#6366f1',
  organic: '#22c55e',
  direct: '#06b6d4',
  referrals: '#f97316',
  walk_in: '#eab308',
  phone: '#14b8a6',
  repeat_client: '#10b981',
  cold_outreach: '#94a3b8',
  other: '#64748b',
};

const SOURCE_LABELS = {
  facebook: 'Facebook',
  paid_social_other: 'Paid Social',
  paid_search: 'Paid Search',
  email_extension: 'Email Prospecting',
  crm_manual: 'CRM Manual',
  integration: 'Integration',
  organic: 'Organic',
  direct: 'Direct / Website',
  referrals: 'Referrals',
  walk_in: 'Walk-In',
  phone: 'Phone Call',
  repeat_client: 'Repeat Client',
  cold_outreach: 'Cold Outreach',
  other: 'Other',
};

function DealModal({ title, deals, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-slate-card border border-white/10 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-base">{title}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto flex-1 flex flex-col gap-2">
          {deals.length === 0 ? (
            <p className="text-white/20 text-sm text-center py-8">No deals</p>
          ) : deals.map((deal) => (
            <div key={deal.id} className="bg-white/5 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                {deal.source && SOURCE_COLORS[deal.source] && (
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SOURCE_COLORS[deal.source] }} />
                )}
                <span className="font-medium text-sm truncate">{deal.name}</span>
              </div>
              {deal.amount > 0 && (
                <span className="text-accent font-semibold text-xs shrink-0">${deal.amount.toLocaleString()}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Returns segments sorted by count descending: [{ source, count }]
function getSourceSegments(deals) {
  const counts = {};
  for (const d of deals) {
    const src = d.source || 'other';
    counts[src] = (counts[src] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => ({ source, count }));
}

function PipelineFunnel({ pKey, stages, onStageClick }) {
  const label = PIPELINE_LABELS[pKey] || pKey;
  const maxReached = Math.max(...stages.map((s) => s.reached), 1);

  return (
    <div>
      <h3 className="text-sm font-semibold text-white/80 mb-3">{label}</h3>
      <div className="space-y-1">
        {stages.map((s, i) => {
          const widthPct = Math.max(s.reached > 0 ? 5 : 0, (s.reached / maxReached) * 100);
          const conv = s.conversionToNext;
          const isLastConv = i < stages.length - 1;
          const clickable = s.reached > 0 && s.deals && s.deals.length > 0;
          const stageValue = (s.deals || []).reduce((sum, d) => sum + d.amount, 0);
          const segments = getSourceSegments(s.deals || []);

          return (
            <React.Fragment key={s.id}>
              <div className="flex items-center gap-2">
                <div className="w-32 text-[11px] text-white/60 truncate text-right pr-1" title={s.label}>
                  {s.label}
                </div>
                <div
                  className={`flex-1 relative h-7 bg-white/[0.03] rounded ${clickable ? 'cursor-pointer' : ''}`}
                  onClick={clickable ? () => onStageClick(`${label} — ${s.label}`, s.deals) : undefined}
                >
                  {/* Segmented color bar */}
                  <div
                    className={`h-full rounded overflow-hidden flex transition-all ${clickable ? 'hover:opacity-80' : ''}`}
                    style={{ width: `${widthPct}%` }}
                  >
                    {segments.length === 0 ? (
                      <div className={`h-full w-full ${s.terminal ? 'bg-success/40' : 'bg-accent/40'}`} />
                    ) : segments.map(({ source, count }) => (
                      <div
                        key={source}
                        style={{
                          width: `${(count / s.reached) * 100}%`,
                          backgroundColor: SOURCE_COLORS[source] || '#64748b',
                          opacity: 0.7,
                        }}
                        title={`${SOURCE_LABELS[source] || source}: ${count}`}
                      />
                    ))}
                  </div>
                  <span className="absolute inset-0 flex items-center justify-start pl-2 text-xs text-white font-medium">
                    {s.reached}
                  </span>
                  {stageValue > 0 && (
                    <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] text-white/50">
                      ${stageValue.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              {isLastConv && conv != null && (
                <div className="flex items-center gap-2">
                  <div className="w-32" />
                  <div className="flex-1 flex items-center pl-2">
                    <span className={`text-[10px] ${
                      conv >= 70 ? 'text-success/70' :
                      conv >= 40 ? 'text-yellow-400/70' :
                      'text-danger/70'
                    }`}>
                      ↓ {conv}%
                    </span>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function SourceLegend({ entries }) {
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 pt-4 border-t border-white/5">
      {entries.map(({ source, count }) => (
        <div key={source} className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: SOURCE_COLORS[source] || '#64748b', opacity: 0.8 }} />
          <span className="text-[11px] text-white/50">{SOURCE_LABELS[source] || source}</span>
          <span className="text-[11px] text-white/25">{count}</span>
        </div>
      ))}
    </div>
  );
}

export default function StageConversion() {
  const { data, loading, error, period, setPeriod, mode, setMode, customRange, setCustomRange } = useStageConversion();
  const [modal, setModal] = useState(null);

  const entries = data
    ? Object.entries(data.conversion).filter(([, stages]) => stages && stages.length > 0)
    : [];

  // Collect all sources across all pipelines/stages for the shared legend
  const legendEntries = (() => {
    if (!entries.length) return [];
    const counts = {};
    for (const [, stages] of entries) {
      for (const s of stages) {
        for (const d of (s.deals || [])) {
          const src = d.source || 'other';
          counts[src] = (counts[src] || 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({ source, count }));
  })();

  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Stage-to-Stage Conversion</h2>
            <p className="text-white/40 text-xs mt-0.5">{MODE_DESCRIPTIONS[mode]}</p>
          </div>
          {loading && (
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-2">
          {[{ value: 'cohort', label: 'Cohort' }, { value: 'snapshot', label: 'Current State' }].map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                mode === m.value
                  ? 'bg-accent text-white'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Period picker — only relevant for cohort mode */}
        {mode !== 'snapshot' && (
          <div className="flex flex-wrap items-center gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  period === p.value
                    ? 'bg-accent text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {mode !== 'snapshot' && period === 'custom' && (
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={customRange.start}
              onChange={(e) => setCustomRange((r) => ({ ...r, start: e.target.value }))}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
            />
            <span className="text-white/40">to</span>
            <input
              type="date"
              value={customRange.end}
              onChange={(e) => setCustomRange((r) => ({ ...r, end: e.target.value }))}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="bg-danger/20 border border-danger/40 rounded-xl px-4 py-3 text-danger text-sm mb-4">
          Failed to load conversion data: {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length > 0 ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {entries.map(([pKey, stages]) => (
              <PipelineFunnel
                key={pKey}
                pKey={pKey}
                stages={stages}
                onStageClick={(title, deals) => setModal({ title, deals })}
              />
            ))}
          </div>
          <SourceLegend entries={legendEntries} />
        </>
      ) : data ? (
        <p className="text-white/20 text-sm text-center py-12">No deals in this period</p>
      ) : null}

      {modal && (
        <DealModal
          title={modal.title}
          deals={modal.deals}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
