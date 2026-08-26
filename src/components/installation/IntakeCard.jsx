import React from 'react';

function scoreColor(score) {
  if (score >= 90) return 'text-success';
  if (score >= 70) return 'text-warning';
  return 'text-danger';
}

export default function IntakeCard({ unreviewed, onViewFresh, onViewStale, onViewAll }) {
  if (!unreviewed) return null;

  const { count, fresh, stale, avgAgeHours, maxAgeHours, score } = unreviewed;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Intake Health (Unreviewed &lt; 24h)</h2>
          <p className="text-gray-400 text-xs mt-0.5">
            Installation manager score — jobs should leave Unreviewed within 24h with a date + section set
          </p>
        </div>
        {count > 0 && onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs text-accent hover:text-accent/80"
          >
            View all &rarr;
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-black/[0.03] rounded-lg p-3">
          <div className="text-gray-400 text-xs uppercase tracking-wider">Score</div>
          <div className={`text-2xl font-bold mt-1 ${scoreColor(score)}`}>{score}%</div>
        </div>
        <div className="bg-black/[0.03] rounded-lg p-3">
          <div className="text-gray-400 text-xs uppercase tracking-wider">Unreviewed</div>
          <div className="text-2xl font-bold mt-1">{count}</div>
        </div>
        <button
          onClick={() => fresh > 0 && onViewFresh && onViewFresh()}
          disabled={fresh === 0}
          className={`bg-black/[0.03] rounded-lg p-3 text-left transition-colors ${
            fresh > 0 ? 'hover:bg-black/[0.05] cursor-pointer' : 'cursor-default'
          }`}
        >
          <div className="text-gray-400 text-xs uppercase tracking-wider">Fresh</div>
          <div className="text-2xl font-bold mt-1 text-success">{fresh}</div>
          <div className="text-gray-300 text-xs">&lt; 24h</div>
        </button>
        <button
          onClick={() => stale > 0 && onViewStale && onViewStale()}
          disabled={stale === 0}
          className={`bg-black/[0.03] rounded-lg p-3 text-left transition-colors ${
            stale > 0 ? 'hover:bg-black/[0.05] cursor-pointer' : 'cursor-default'
          }`}
        >
          <div className="text-gray-400 text-xs uppercase tracking-wider">Stale</div>
          <div className={`text-2xl font-bold mt-1 ${stale > 0 ? 'text-danger' : 'text-gray-400'}`}>{stale}</div>
          <div className="text-gray-300 text-xs">&gt; 24h</div>
        </button>
        <div className="bg-black/[0.03] rounded-lg p-3">
          <div className="text-gray-400 text-xs uppercase tracking-wider">Avg Age</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {avgAgeHours < 24 ? `${avgAgeHours}h` : `${(avgAgeHours / 24).toFixed(1)}d`}
          </div>
          <div className="text-gray-300 text-xs">max {maxAgeHours < 24 ? `${maxAgeHours}h` : `${(maxAgeHours / 24).toFixed(1)}d`}</div>
        </div>
      </div>
    </div>
  );
}
