import React, { useState } from 'react';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch { return dateStr; }
}

const STATE_CFG = {
  on_time:     { label: 'Done',        cls: 'bg-green-500/20 border-green-500/30 text-green-400' },
  in_progress: { label: 'Upcoming',    cls: 'bg-blue-500/20 border-blue-500/30 text-blue-400' },
  overdue:     { label: 'Overdue',     cls: 'bg-red-500/20 border-red-500/30 text-red-400' },
  late:        { label: 'Delivered Late', cls: 'bg-orange-500/20 border-orange-500/30 text-orange-400' },
};

function getDayLabel(dateStr) {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

function StatCol({ label, data, showDailyBreakdown }) {
  const total = data.scheduled;
  const onTimeRate = total > 0 && data.onTime + data.late > 0
    ? Math.round((data.onTime / (data.onTime + data.late)) * 100)
    : null;

  // Build day-by-day counts from jobs array
  const dailyMap = {};
  if (showDailyBreakdown && data.jobs) {
    for (const job of data.jobs) {
      if (!job.installDate) continue;
      if (!dailyMap[job.installDate]) dailyMap[job.installDate] = 0;
      dailyMap[job.installDate]++;
    }
  }
  const dailyDays = Object.keys(dailyMap).sort();
  const maxCount = dailyDays.length ? Math.max(...dailyDays.map(d => dailyMap[d])) : 1;

  return (
    <div className="bg-black/[0.02] border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">{label}</div>
      <div className="space-y-2">
        <div className="flex justify-between items-baseline">
          <span className="text-xs text-gray-500">Scheduled</span>
          <span className="text-2xl font-bold text-gray-900 tabular-nums">{total}</span>
        </div>
        {data.onTime > 0 && (
          <div className="flex justify-between items-baseline">
            <span className="text-xs text-gray-500">On Time</span>
            <span className="text-sm font-bold text-green-400 tabular-nums">{data.onTime}</span>
          </div>
        )}
        {data.late > 0 && (
          <div className="flex justify-between items-baseline">
            <span className="text-xs text-gray-500">Late</span>
            <span className="text-sm font-bold text-red-400 tabular-nums">{data.late}</span>
          </div>
        )}
        {data.inProgress > 0 && (
          <div className="flex justify-between items-baseline">
            <span className="text-xs text-gray-500">Upcoming</span>
            <span className="text-sm font-bold text-blue-400 tabular-nums">{data.inProgress}</span>
          </div>
        )}
        {onTimeRate !== null && (
          <div className="pt-1">
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${onTimeRate}%`,
                  backgroundColor: onTimeRate >= 80 ? '#22c55e' : onTimeRate >= 60 ? '#eab308' : '#ef4444',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Per-day breakdown */}
      {showDailyBreakdown && dailyDays.length > 0 && (
        <div className="pt-1 border-t border-gray-200 space-y-1.5">
          {dailyDays.map(dateStr => {
            const count = dailyMap[dateStr];
            return (
              <div key={dateStr} className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 w-24 shrink-0">{getDayLabel(dateStr)}</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm bg-blue-500/60"
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="text-[11px] font-semibold text-gray-600 tabular-nums w-4 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CrewCard({ crew }) {
  const [expanded, setExpanded] = useState(true);
  const { name, color, jobs } = crew;

  if (jobs.length === 0) {
    return (
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderLeft: `3px solid ${color}` }}>
          <span className="text-sm font-semibold text-gray-600">{name}</span>
          <span className="text-xs text-gray-300">No jobs this week</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/[0.02] transition-colors text-left"
        style={{ borderLeft: `3px solid ${color}` }}
        onClick={() => setExpanded(v => !v)}
      >
        <span className="text-sm font-semibold text-gray-800 flex-1">{name}</span>
        <span className="text-xs text-gray-400 tabular-nums">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
        <span className="text-gray-300 text-xs">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="divide-y divide-gray-100">
          {jobs.map(job => {
            const cfg = STATE_CFG[job.state] ?? STATE_CFG.in_progress;
            return (
              <div key={job.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-black/[0.02] transition-colors">
                <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${cfg.cls}`}>
                  {cfg.label}
                </span>
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 text-sm text-gray-700 truncate hover:text-gray-900 transition-colors"
                  title={job.name}
                  onClick={e => e.stopPropagation()}
                >
                  {job.name}
                </a>
                <span className="shrink-0 text-xs text-gray-300 tabular-nums">{formatDate(job.installDate)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ScheduleSection({ schedule }) {
  const [showCrews, setShowCrews] = useState(true);

  if (!schedule) return null;
  const { thisWeek, lastWeek, monthToDate } = schedule;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-5">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
        Installation Schedule
      </h2>

      {/* Three-column stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCol label="This Week"     data={thisWeek}     showDailyBreakdown />
        <StatCol label="Last Week"     data={lastWeek} />
        <StatCol label="Month to Date" data={monthToDate} />
      </div>

      {/* This week's jobs by crew */}
      {thisWeek.jobs.length > 0 && (
        <div>
          <button
            onClick={() => setShowCrews(v => !v)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-3 w-full text-left"
          >
            <span>{showCrews ? '▾' : '▸'}</span>
            <span className="font-medium">This week's jobs by crew ({thisWeek.jobs.length})</span>
          </button>
          {showCrews && (
            <div className="space-y-2">
              {thisWeek.crews.map(crew => (
                <CrewCard key={crew.name} crew={crew} />
              ))}
            </div>
          )}
        </div>
      )}

      {thisWeek.jobs.length === 0 && (
        <p className="text-gray-300 text-sm text-center py-2">No jobs scheduled this week</p>
      )}
    </div>
  );
}
