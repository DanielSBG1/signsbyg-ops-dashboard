import React, { useState } from 'react';

function formatDate(iso) {
  if (!iso) return 'No date';
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/**
 * RescheduledPanel \u2014 expandable reschedule log panel.
 *
 * Props:
 *   jobs        {Array}   \u2014 rescheduled job objects with rescheduleLog
 *   jobMap      {object}  \u2014 gid \u2192 full job object
 *   onSelectJob {(job) => void}
 */
export default function RescheduledPanel({ jobs, jobMap, onSelectJob }) {
  const [expandedGid, setExpandedGid] = useState(null);

  if (jobs.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-500 text-sm">
        No rescheduled jobs right now.
      </div>
    );
  }

  return (
    <div className="bg-white border border-warning/30 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest">Rescheduled Jobs</p>
        <p className="text-xs text-gray-500">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</p>
      </div>
      {/* Column headers */}
      <div className="px-5 py-2 border-b border-gray-100 grid grid-cols-[1fr_auto_auto] gap-4 items-center">
        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest">Job</span>
        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest text-right">Current Due</span>
        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest text-right">Reschedules</span>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {jobs.map(job => {
          const isExpanded = expandedGid === job.gid;
          return (
            <div key={job.gid}>
              <button
                onClick={() => setExpandedGid(isExpanded ? null : job.gid)}
                className="w-full text-left px-5 py-3.5 hover:bg-black/[0.02] transition-colors grid grid-cols-[1fr_auto_auto] gap-4 items-center"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{job.name}</p>
                </div>
                <div className="text-right shrink-0">
                  {job.due_on
                    ? <span className="text-[11px] text-gray-500">{formatDate(job.due_on)}</span>
                    : <span className="text-[11px] text-gray-500">&mdash;</span>}
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-flex items-center gap-1 text-sm font-bold tabular-nums text-warning">
                    \u21bb{job.reschedules}
                  </span>
                </div>
              </button>
              {/* Expandable reschedule log */}
              {isExpanded && job.rescheduleLog.length > 0 && (
                <div className="px-5 pb-4">
                  <div className="ml-2 border-l-2 border-warning/20 pl-3 space-y-2 py-1">
                    {job.rescheduleLog.map((entry, i) => {
                      const fromStr = formatDate(entry.from);
                      const toStr = formatDate(entry.to);
                      const atStr = entry.changedAt
                        ? new Date(entry.changedAt).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', timeZone: 'UTC',
                          })
                        : '';
                      return (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-warning/50 shrink-0" />
                          <span className="text-gray-500">
                            Changed from <span className="text-gray-600 font-medium">{fromStr}</span>
                            {' '}\u2192{' '}
                            <span className="text-gray-600 font-medium">{toStr}</span>
                            {atStr && <span className="text-gray-500"> on {atStr}</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const full = jobMap[job.gid];
                      if (full) onSelectJob(full);
                    }}
                    className="mt-2 ml-2 text-[10px] text-accent hover:underline"
                  >
                    View full job details \u2192
                  </button>
                </div>
              )}
              {isExpanded && job.rescheduleLog.length === 0 && (
                <div className="px-5 pb-4">
                  <p className="text-[11px] text-gray-500 ml-2">No detailed log available.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
