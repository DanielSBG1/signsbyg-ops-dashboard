import React from 'react';

function WeekBar({ label, onTime, late }) {
  const total = onTime + late;
  const onTimePct = total > 0 ? Math.round((onTime / total) * 100) : 0;
  const latePct   = total > 0 ? 100 - onTimePct : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-white/50">
        <span>{label}</span>
        <span className="tabular-nums">{total} job{total !== 1 ? 's' : ''}</span>
      </div>
      <div className="h-7 rounded-lg overflow-hidden flex bg-white/5">
        {total === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[10px] text-white/20">
            No data
          </div>
        ) : (
          <>
            {onTime > 0 && (
              <div
                className="bg-success/60 flex items-center justify-center text-[10px] text-white font-medium transition-all"
                style={{ width: `${onTimePct}%` }}
              >
                {onTime}
              </div>
            )}
            {late > 0 && (
              <div
                className="bg-danger/60 flex items-center justify-center text-[10px] text-white font-medium transition-all"
                style={{ width: `${latePct}%` }}
              >
                {late}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function ThroughputTab({ data }) {
  if (!data) {
    return (
      <div className="text-center py-20 text-white/30 text-sm">Loading throughput data...</div>
    );
  }

  const { weeks, onTimeRate } = data;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* On-time rate summary */}
      <div className="bg-white/[0.03] rounded-xl p-5">
        <p className="text-white/40 text-xs mb-1">4-Week On-Time Rate</p>
        <p className={`text-4xl font-bold tabular-nums ${
          onTimeRate === null  ? 'text-white/30' :
          onTimeRate >= 80    ? 'text-success'  :
          onTimeRate >= 60    ? 'text-warning'  : 'text-danger'
        }`}>
          {onTimeRate !== null ? `${onTimeRate}%` : '—'}
        </p>
      </div>

      {/* Weekly breakdown */}
      <div className="bg-white/[0.03] rounded-xl p-5 space-y-5">
        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px] text-white/40">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded bg-success/60 inline-block" /> On Time
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded bg-danger/60 inline-block" /> Late
          </span>
        </div>
        {weeks.map((w, i) => (
          <WeekBar key={i} label={w.label} onTime={w.onTime} late={w.late} />
        ))}
      </div>
    </div>
  );
}
