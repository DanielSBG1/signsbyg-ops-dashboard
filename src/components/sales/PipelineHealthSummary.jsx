import React from 'react';

function formatMoney(amount) {
  if (!amount) return '$0';
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${Math.round(amount / 1000)}k`;
  return `$${Math.round(amount)}`;
}

/**
 * Compact alert-style card on the Sales tab.
 *
 * Each line is an action item ("12 hot deals to close"), not a passive label.
 * The "stuck in pre-design" sub-line under aging only appears when count > 0.
 *
 * Props:
 *   pipelineHealth: object from API response (metrics.data.pipelineHealth)
 *   onViewFullReport: callback when "View Full Report" link is clicked
 */
export default function PipelineHealthSummary({ pipelineHealth, onViewFullReport }) {
  if (!pipelineHealth) return null;

  // Empty state: constants not yet computed
  if (!pipelineHealth.generatedAt) {
    return (
      <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-2">Pipeline Health</h2>
        <p className="text-yellow-400 text-sm">
          ⚠️ Run <code className="bg-white/10 px-1.5 py-0.5 rounded">scripts/compute-avg-cycle.js</code> to enable Pipeline Health.
        </p>
      </div>
    );
  }

  const { totals } = pipelineHealth;
  const isHealthy = totals.hot === 0 && totals.aging === 0 && totals.cold === 0;

  return (
    <div className="bg-slate-card border border-white/5 rounded-xl px-4 py-2.5 flex items-center justify-between flex-wrap gap-x-4 gap-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase tracking-wider text-white/50 font-medium mr-1">Pipeline Health</span>
        {isHealthy ? (
          <span className="text-success text-xs">🎉 Healthy — no action items</span>
        ) : (
          <>
            <Chip icon="🔥" count={totals.hot} value={formatMoney(totals.hotValue)} colorClass="text-orange-400" label="hot" />
            <Chip icon="⚠️" count={totals.aging} value={formatMoney(totals.agingValue)} colorClass="text-yellow-400" label="aging" sub={totals.stuckPreDesign > 0 ? `${totals.stuckPreDesign} stuck pre-design` : null} />
            <Chip icon="🥶" count={totals.cold} value={formatMoney(totals.coldValue)} colorClass="text-blue-300" label="cold" />
            {totals.designQueue > 0 && (
              <Chip
                icon="🎨"
                count={totals.designQueue}
                value={formatMoney(totals.designQueueValue)}
                colorClass="text-purple-300"
                label="in design"
                sub={totals.stuckPreDesign > 0 ? `${totals.stuckPreDesign} stuck >2d` : null}
              />
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-white/40 text-xs">
          Total open: {formatMoney(totals.openValue)} · {totals.open} deals
        </span>
        <button onClick={onViewFullReport} className="text-accent text-xs hover:underline">
          Full Report →
        </button>
      </div>
    </div>
  );
}

function Chip({ icon, count, value, colorClass, label, sub }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${colorClass}`} title={sub || undefined}>
      <span>{icon}</span>
      <span className="font-semibold tabular-nums">{count}</span>
      <span className="text-white/40">{label}</span>
      <span className="text-white/40">·</span>
      <span className="text-white/50 tabular-nums">{value}</span>
      {sub && <span className="text-yellow-400/70 ml-1">({sub})</span>}
    </span>
  );
}
