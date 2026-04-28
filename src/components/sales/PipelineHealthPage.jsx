import React, { useState, useMemo } from 'react';
import PipelineHealthPipelineCard from './PipelineHealthPipelineCard';
import PipelineHealthDealList, { REASON_LABELS, formatMoney } from './PipelineHealthDealList';
import StageConversion from './StageConversion';
import DealDrawer from './DealDrawer';

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
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [bucketModal, setBucketModal] = useState(null); // { title, deals }

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
    <>
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
        <KpiCard label="🔥 Hot" big={String(totals.hot)} sub={formatMoney(totals.hotValue)} colorClass="text-orange-400" onClick={() => document.getElementById('section-hot')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        <KpiCard label="⚠️ Aging" big={String(totals.aging)} sub={formatMoney(totals.agingValue)} colorClass="text-yellow-400" onClick={() => document.getElementById('section-aging')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        <KpiCard label="🥶 Cold" big={String(totals.cold)} sub={formatMoney(totals.coldValue)} colorClass="text-blue-300" onClick={() => document.getElementById('section-cold')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
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
          <PipelineHealthPipelineCard
            key={key}
            pipeline={p}
            generatedAt={pipelineHealth.generatedAt}
            onBucketClick={(title, deals) => setBucketModal({ title, deals })}
          />
        ))}
      </div>

      {/* Stage-to-stage conversion (leading indicator) */}
      <StageConversion onDealClick={setSelectedDeal} />

      {/* HOT section */}
      <Section id="section-hot" title="🔥 HOT DEALS — Close these now" subtitle={`${totals.hot} deals · ${formatMoney(totals.hotValue)}`}>
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
          onDealClick={setSelectedDeal}
        />
      </Section>

      {/* AGING section */}
      <Section id="section-aging" title="⚠️ AGING DEALS — Need attention" subtitle={`${totals.aging} deals · ${formatMoney(totals.agingValue)}`}>
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
          onDealClick={setSelectedDeal}
        />
        <p className="text-white/30 text-[10px] mt-2">
          * "Days" = days in current stage for stuck/decayed reasons; total deal age for age-based.
        </p>
      </Section>

      {/* COLD section */}
      <Section id="section-cold" title="🥶 COLD DEALS — Save or kill" subtitle={`${totals.cold} deals · ${formatMoney(totals.coldValue)}`}>
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
          onDealClick={setSelectedDeal}
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
          onDealClick={setSelectedDeal}
        />
      </Section>
      </div>
      <DealDrawer deal={selectedDeal} onClose={() => setSelectedDeal(null)} />
      {bucketModal && (
        <BucketDealListModal
          title={bucketModal.title}
          deals={bucketModal.deals}
          onClose={() => setBucketModal(null)}
          onDealClick={(deal) => { setBucketModal(null); setSelectedDeal(deal); }}
        />
      )}
    </>
  );
}

function BucketDealListModal({ title, deals, onClose, onDealClick }) {
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
            <div
              key={deal.id}
              className="bg-white/5 rounded-xl px-4 py-3 flex items-center justify-between gap-4 cursor-pointer hover:bg-white/10 transition-colors"
              onClick={() => onDealClick(deal)}
            >
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{deal.name}</div>
                <div className="text-white/40 text-xs">{deal.stageLabel} · {deal.ownerName}</div>
              </div>
              <div className="shrink-0 text-right">
                {deal.amount > 0 && (
                  <div className="text-accent font-semibold text-xs">${deal.amount.toLocaleString()}</div>
                )}
                {deal.stageAgeDays != null && (
                  <div className="text-white/30 text-[10px]">{deal.stageAgeDays}d in stage</div>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-white/25 text-[10px] mt-3 text-center">Click a deal to see full details</p>
      </div>
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

function KpiCard({ label, big, sub, colorClass = 'text-white', onClick }) {
  return (
    <div
      className={`bg-slate-card border border-white/5 rounded-xl p-4 transition-colors ${onClick ? 'cursor-pointer hover:border-white/20 hover:bg-white/[0.06]' : ''}`}
      onClick={onClick}
      title={onClick ? `Jump to ${label} section` : undefined}
    >
      <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorClass}`}>{big}</p>
      <p className="text-white/50 text-xs mt-1">{sub}</p>
      {onClick && <p className="text-white/20 text-[9px] mt-1.5">↓ click to jump</p>}
    </div>
  );
}

function Section({ id, title, subtitle, rightSlot, children }) {
  return (
    <div id={id} className="bg-slate-card border border-white/5 rounded-2xl p-6">
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
