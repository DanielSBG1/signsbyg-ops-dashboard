import React from 'react';

function formatMoney(amount) {
  if (!amount) return '$0';
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${Math.round(amount / 1000)}k`;
  return `$${Math.round(amount)}`;
}

/**
 * Compact summary card for one pipeline.
 *
 * Props:
 *   pipeline: object from pipelineHealth.byPipeline[key]
 *     {
 *       label, avgCycleDays, avgCycleSampleSize,
 *       counts: { hot, active, aging, cold },
 *       values: { hot, active, aging, cold },
 *       buckets: { hot, active, aging, cold }  ← arrays of deal objects
 *     }
 *   generatedAt: string from pipelineHealth.generatedAt
 *   onBucketClick: (title, deals) => void — optional, called when a bucket row is clicked
 */
export default function PipelineHealthPipelineCard({ pipeline, generatedAt, onBucketClick }) {
  const cycleTooltip = `Computed from ${pipeline.avgCycleSampleSize} closed-won deals since Mar 2025. Last refreshed: ${generatedAt || 'never'}`;

  function handleBucket(label, bucketKey) {
    if (!onBucketClick) return;
    const deals = pipeline.buckets?.[bucketKey] || [];
    if (deals.length === 0) return;
    onBucketClick(`${pipeline.label} — ${label}`, deals);
  }

  return (
    <div className="bg-white/5 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">{pipeline.label}</h3>
        <span
          className="text-xs text-white/50 cursor-help border-b border-dotted border-white/20"
          title={cycleTooltip}
        >
          avg cycle: {pipeline.avgCycleDays}d
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <BucketRow
          label="🔥 Hot"
          count={pipeline.counts.hot}
          value={pipeline.values.hot}
          colorClass="text-orange-400"
          onClick={onBucketClick ? () => handleBucket('🔥 Hot', 'hot') : undefined}
          clickable={pipeline.counts.hot > 0}
        />
        <BucketRow
          label="🌡️ Active"
          count={pipeline.counts.active}
          value={pipeline.values.active}
          colorClass="text-white/70"
          onClick={onBucketClick ? () => handleBucket('🌡️ Active', 'active') : undefined}
          clickable={pipeline.counts.active > 0}
        />
        <BucketRow
          label="⚠️ Aging"
          count={pipeline.counts.aging}
          value={pipeline.values.aging}
          colorClass="text-yellow-400"
          onClick={onBucketClick ? () => handleBucket('⚠️ Aging', 'aging') : undefined}
          clickable={pipeline.counts.aging > 0}
        />
        <BucketRow
          label="🥶 Cold"
          count={pipeline.counts.cold}
          value={pipeline.values.cold}
          colorClass="text-blue-300"
          onClick={onBucketClick ? () => handleBucket('🥶 Cold', 'cold') : undefined}
          clickable={pipeline.counts.cold > 0}
        />
      </div>
    </div>
  );
}

function BucketRow({ label, count, value, colorClass, onClick, clickable }) {
  const interactive = onClick && clickable;
  return (
    <div
      className={`flex items-center justify-between rounded-lg px-1 py-0.5 -mx-1 transition-colors ${
        interactive ? 'cursor-pointer hover:bg-white/8' : ''
      }`}
      onClick={interactive ? onClick : undefined}
    >
      <span className={colorClass}>
        {label} <span className="text-white/40">{count}</span>
      </span>
      <span className="text-white/50 text-[11px]">{formatMoney(value)}</span>
    </div>
  );
}
