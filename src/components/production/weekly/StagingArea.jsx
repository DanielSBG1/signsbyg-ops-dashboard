import React from 'react';

function formatDate(iso) {
  if (!iso) return 'No date';
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/**
 * StagingArea \u2014 emerald-themed panel listing jobs ready for installation.
 *
 * Props:
 *   stagedJobs   {Array}   \u2014 list of staged job objects
 *   jobMap       {object}  \u2014 gid \u2192 full job object
 *   onSelectJob  {(job) => void}
 */
export default function StagingArea({ stagedJobs, jobMap, onSelectJob }) {
  if (!stagedJobs?.length) return null;

  return (
    <div className="bg-white border border-emerald-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-emerald-100 flex items-center justify-between bg-emerald-50/50">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Staging Area</p>
        </div>
        <p className="text-xs text-emerald-600">
          {stagedJobs.length} job{stagedJobs.length !== 1 ? 's' : ''} ready for installation
        </p>
      </div>
      <div className="divide-y divide-emerald-100">
        {stagedJobs.map(job => (
          <button
            key={job.gid}
            onClick={() => { const full = jobMap[job.gid]; if (full) onSelectJob(full); }}
            className="w-full text-left px-5 py-3 hover:bg-emerald-50/50 transition-colors flex items-center gap-4"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{job.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-gray-500">{formatDate(job.due_on)}</span>
                {job.department && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/[0.04] text-gray-500 font-medium">
                    {job.department}
                  </span>
                )}
                {job.isRescheduled && (
                  <span className={`text-[10px] font-semibold tabular-nums ${
                    job.driftSeverity === 'severe' ? 'text-danger' :
                    job.driftSeverity === 'moderate' ? 'text-orange-500' : 'text-warning'
                  }`}>
                    \u21bb +{job.driftDays}d
                  </span>
                )}
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold shrink-0">
              Ready
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
