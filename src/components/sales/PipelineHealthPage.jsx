import React, { useState, useMemo } from 'react';
import PipelineHealthPipelineCard from './PipelineHealthPipelineCard';
import PipelineHealthDealList, { REASON_LABELS, formatMoney } from './PipelineHealthDealList';
import StageConversion from './StageConversion';

const NEW_DEALS_PERIODS = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
];

/**
 * Full dedicated Pipeline Health page rendered when the Pipeline Health tab is active.
 *
 * Layout:
 *   - Header (live snapshot indicator)
 *   - 4-card KPI strip (total open / hot / aging / cold)
 *   - 2x2 pipeline summary grid (one card per pipeline)
 *   - HOT DEALS section (per-pipeline grouped)
 *   - AGING DEALS section (per-pipeline grouped, sorted by priority)
 *   - COLD DEALS section (per-pipeline grouped)
 *   - NEW DEALS section (own period selector)
 */
export default function PipelineHealthPage({ pipelineHealth }) {
  const [newDealsPeriod, setNewDealsPeriod] = useState(30);

  // Build per-pipeline groupings — must be called unconditionally before any early return
  const hotByPipeline = useMemo(() => makeGrouping(pipelineHealth?.byPipeline, 'hot'), [pipelineHealth]);
  const agingByPipeline = useMemo(() => makeGrouping(pipelineHealth?.byPipeline, 'aging'), [pipelineHealth]);
  const coldByPipeline = useMemo(() => makeGrouping(pipelineHealth?.byPipeline, 'cold'), [pipelineHealth]);

  const newDealsByPipeline = useMemo(() => {
    if (!pipelineHealth?.byPipeline) return {};
    const cutoff = Date.now() - newDealsPeriod * 86400000;
    const result = {};
    for (const [key, p] of Object.entries(pipelineHealth.byPipeline)) {
      const allDealsInPipeline = [
        ...p.buckets.hot,
        ...p.buckets.active,
        ...p.buckets.aging,
        ...p.buckets.cold,
      ];
      const filtered = allDealsInPipeline
        .filter((d) => d.createdate && Date.parse(d.createdate) >= cutoff)
        .sort((a, b) => Date.parse(b.createdate) - Date.parse(a.createdate));
      result[key] = { label: p.label, deals: filtered };
    }
    return result;
  }, [pipelineHealth, newDealsPeriod]);

  if (!pipelineHealth) {
    return (
      <div className="text-center py-20 text-white/40">
        Loading pipeline health...
      </div>
    );
  }

  if (!pipelineHealth.generatedAt) {
    return (
      <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-3">Pipeline Health</h2>
        <p className="text-yellow-400">
          ⚠️ Run <code className="bg-white/10 px-1.5 py-0.5 rounded">scripts/compute-avg-cycle.js</code> and update constants to enable Pipeline Health.
        </p>
      </div>
    );
  }

  const { totals, byPipeline } = pipelineHealth;

  const newDealsTotal = Object.values(newDealsByPipeline).reduce((s, p) => s + p.deals.length, 0);
  const newDealsValue = Object.values(newDealsByPipeline).reduce(
    (s, p) => s + p.deals.reduce((sum, d) => sum + (d.amount || 0), 0), 0,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pipeline Health</h1>
          <p className="text-white/40 text-xs mt-1">
            Live snapshot · Avg cycle constants generated {pipelineHealth.generatedAt}
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard label="Total Open" big={formatMoney(totals.openValue)} sub={`${totals.open} deals`} />
        <KpiCard label="🔥 Hot" big={String(totals.hot)} sub={formatMoney(totals.hotValue)} colorClass="text-orange-400" />
        <KpiCard label="⚠️ Aging" big={String(totals.aging)} sub={formatMoney(totals.agingValue)} colorClass="text-yellow-400" />
        <KpiCard label="🥶 Cold" big={String(totals.cold)} sub={formatMoney(totals.coldValue)} colorClass="text-blue-300" />
      </div>

      {/* Pipeline Coverage Ratio (leading indicator) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold">Pipeline Coverage</h2>
          <span className="text-white/40 text-xs">
            Open value ÷ trailing-30-day revenue · Target ≥ {pipelineHealth.coverageTarget || 3}×
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {Object.entries(byPipeline).map(([key, p]) => (
            <CoverageCard key={key} label={p.label} coverage={p.coverage} target={pipelineHealth.coverageTarget || 3} />
          ))}
        </div>
      </div>

      {/* Per-pipeline 2x2 grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {Object.entries(byPipeline).map(([key, p]) => (
          <PipelineHealthPipelineCard key={key} pipeline={p} generatedAt={pipelineHealth.generatedAt} />
        ))}
      </div>

      {/* Stage-to-stage conversion (leading indicator) */}
      <StageConversion />

      {/* HOT section */}
      <Section title="🔥 HOT DEALS — Close these now" subtitle={`${totals.hot} deals · ${formatMoney(totals.hotValue)}`}>
        <PipelineHealthDealList
          pipelines={hotByPipeline}
          columns={[
            { key: 'name', label: 'Deal' },
            { key: 'stageLabel', label: 'Stage' },
            { key: 'reason', label: 'Reason', render: (d) => REASON_LABELS[d.reason] || d.reason },
            { key: 'ownerName', label: 'Owner' },
            { key: 'amount', label: 'Amount', render: (d) => formatMoney(d.amount) },
            { key: 'stageAgeDays', label: 'Stage age', render: (d) => `${d.stageAgeDays}d` },
          ]}
          emptyMessage="No hot deals right now."
        />
      </Section>

      {/* AGING section */}
      <Section title="⚠️ AGING DEALS — Need attention" subtitle={`${totals.aging} deals · ${formatMoney(totals.agingValue)}`}>
        <PipelineHealthDealList
          pipelines={agingByPipeline}
          columns={[
            { key: 'reason', label: 'Reason', render: (d) =>
              d.reason === 'stuck_pre_design'
                ? <span className="text-yellow-400 font-medium">{REASON_LABELS[d.reason]}</span>
                : REASON_LABELS[d.reason]
            },
            { key: 'name', label: 'Deal' },
            { key: 'stageLabel', label: 'Stage' },
            { key: 'ownerName', label: 'Owner' },
            { key: 'amount', label: 'Amount', render: (d) => formatMoney(d.amount) },
            { key: 'days', label: 'Days', render: (d) =>
              d.reason === 'age_threshold' ? `${d.ageDays}d` : `${d.stageAgeDays}d`
            },
          ]}
          emptyMessage="No aging deals."
        />
        <p className="text-white/30 text-[10px] mt-2">
          * "Days" = days in current stage for stuck/decayed reasons; total deal age for age-based.
        </p>
      </Section>

      {/* COLD section */}
      <Section title="🥶 COLD DEALS — Save or kill" subtitle={`${totals.cold} deals · ${formatMoney(totals.coldValue)}`}>
        <PipelineHealthDealList
          pipelines={coldByPipeline}
          columns={[
            { key: 'name', label: 'Deal' },
            { key: 'stageLabel', label: 'Stage' },
            { key: 'ownerName', label: 'Owner' },
            { key: 'amount', label: 'Amount', render: (d) => formatMoney(d.amount) },
            { key: 'ageDays', label: 'Days old', render: (d) => `${d.ageDays}d` },
          ]}
          emptyMessage="No cold deals."
        />
      </Section>

      {/* NEW DEALS section with own period selector */}
      <Section
        title="🆕 NEW DEALS"
        subtitle={`${newDealsTotal} deals · ${formatMoney(newDealsValue)} total`}
        rightSlot={
          <select
            value={newDealsPeriod}
            onChange={(e) => setNewDealsPeriod(Number(e.target.value))}
            className="bg-white/10 text-white/80 text-xs rounded px-2 py-1 border border-white/10"
          >
            {NEW_DEALS_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        }
      >
        <PipelineHealthDealList
          pipelines={newDealsByPipeline}
          columns={[
            { key: 'createdate', label: 'Date', render: (d) => d.createdate?.substring(0, 10) || '—' },
            { key: 'name', label: 'Deal' },
            { key: 'stageLabel', label: 'Stage' },
            { key: 'ownerName', label: 'Owner' },
            { key: 'amount', label: 'Amount', render: (d) => formatMoney(d.amount) },
          ]}
          emptyMessage="No new deals in this window."
        />
      </Section>
    </div>
  );
}

function makeGrouping(byPipeline, bucketName) {
  if (!byPipeline) return {};
  const result = {};
  for (const [key, p] of Object.entries(byPipeline)) {
    result[key] = { label: p.label, deals: p.buckets[bucketName] || [] };
  }
  return result;
}

function CoverageCard({ label, coverage, target }) {
  if (!coverage || coverage.ratio == null) {
    return (
      <div className="bg-slate-card border border-white/5 rounded-xl p-4">
        <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">{label}</p>
        <p className="text-2xl font-bold text-white/30">—</p>
        <p className="text-white/40 text-xs mt-1">No revenue last 30 days</p>
      </div>
    );
  }
  const { ratio, openValue, trailing30Revenue } = coverage;
  const status =
    ratio >= target ? { color: 'text-success', border: 'border-success/30' } :
    ratio >= target * 0.66 ? { color: 'text-yellow-400', border: 'border-yellow-400/30' } :
    { color: 'text-danger', border: 'border-danger/30' };
  return (
    <div className={`bg-slate-card border ${status.border} rounded-xl p-4`}>
      <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${status.color}`}>{ratio}×</p>
      <p className="text-white/40 text-xs mt-1">
        {formatMoney(openValue)} open ÷ {formatMoney(trailing30Revenue)}/mo
      </p>
    </div>
  );
}

function KpiCard({ label, big, sub, colorClass = 'text-white' }) {
  return (
    <div className="bg-slate-card border border-white/5 rounded-xl p-4">
      <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorClass}`}>{big}</p>
      <p className="text-white/50 text-xs mt-1">{sub}</p>
    </div>
  );
}

function Section({ title, subtitle, rightSlot, children }) {
  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-white/40 text-xs mt-0.5">{subtitle}</p>
        </div>
        {rightSlot}
      </div>
      {children}
    </div>
  );
}
