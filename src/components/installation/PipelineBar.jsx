import React, { useState } from 'react';

const STATUS_SEGMENTS = [
  { key: 'late',      label: 'Late',      color: '#ef4444' },
  { key: 'pending',   label: 'No Date',   color: '#6b7280' },
  { key: 'scheduled', label: 'Scheduled', color: '#3b82f6' },
];

function JobListModal({ label, color, jobs, onClose }) {
  React.useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1e30] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0"
          style={{ backgroundColor: `${color}20` }}>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-lg font-bold text-white">{label}</span>
            <span className="text-sm text-white/40">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/80 text-2xl leading-none">×</button>
        </div>

        <div className="grid grid-cols-[1fr_130px_110px] gap-4 px-6 py-3 border-b border-white/5 bg-white/[0.02] flex-shrink-0">
          <span className="text-xs uppercase tracking-wider text-white/35">Job Name</span>
          <span className="text-xs uppercase tracking-wider text-white/35">Crew</span>
          <span className="text-xs uppercase tracking-wider text-white/35">Install Date</span>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-white/[0.04]">
          {jobs.map(job => (
            <div key={job.id}
              className="grid grid-cols-[1fr_130px_110px] gap-4 items-center px-6 py-3 hover:bg-white/[0.03]"
            >
              <a href={job.url} target="_blank" rel="noreferrer"
                className="text-sm text-white/85 truncate hover:text-white" title={job.name}>
                {job.name}
              </a>
              <span className="text-sm text-white/50 truncate">
                {job.crews?.length ? job.crews.join(', ') : '—'}
              </span>
              <span className={`text-sm tabular-nums ${job.status === 'late' ? 'text-red-400 font-semibold' : 'text-white/50'}`}>
                {job.installDate
                  ? new Date(job.installDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PipelineBar({ summary, jobs }) {
  const [active, setActive] = useState(null);

  if (!summary || !jobs) return null;

  const openJobs = jobs.filter(j => j.status === 'late' || j.status === 'pending' || j.status === 'scheduled');
  const totalOpen = summary.open || openJobs.length;

  const segments = STATUS_SEGMENTS.map(seg => ({
    ...seg,
    count: summary[seg.key] ?? 0,
    jobs: openJobs.filter(j => j.status === seg.key),
  })).filter(seg => seg.count > 0);

  // Section bar
  const sections = (summary._bySectionSnapshot ?? []);

  // On-time rate color
  const rate = summary.onTimeRate ?? 0;
  const rateColor = rate >= 80 ? '#22c55e' : rate >= 60 ? '#eab308' : '#ef4444';

  return (
    <>
      <div className="bg-slate-card border border-white/5 rounded-2xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Installation Pipeline</h2>
          <span className="text-sm font-bold" style={{ color: rateColor }}>
            {rate}% on-time
          </span>
        </div>

        {/* Status distribution */}
        {totalOpen > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs text-white/40 mb-2">
              <span>Open jobs by status — click to view</span>
              <span>{totalOpen} open</span>
            </div>
            <div className="flex h-7 rounded-lg overflow-hidden gap-px">
              {segments.map(seg => (
                <button
                  key={seg.key}
                  title={`${seg.label}: ${seg.count}`}
                  className="hover:brightness-125 transition-all focus:outline-none"
                  style={{ width: `${(seg.count / totalOpen) * 100}%`, backgroundColor: seg.color }}
                  onClick={() => setActive(seg)}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5">
              {segments.map(seg => (
                <button
                  key={seg.key}
                  onClick={() => setActive(seg)}
                  className="flex items-center gap-1.5 text-xs text-white/55 hover:text-white/90 transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }} />
                  {seg.label}
                  <span className="text-white/30">{seg.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* On-time rate bar */}
        <div>
          <div className="flex items-center justify-between text-xs text-white/40 mb-2">
            <span>On-time rate (completed jobs)</span>
            <span>{summary.early + summary.onTime} of {summary.early + summary.onTime + summary.failed} completed</span>
          </div>
          <div className="h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${rate}%`, backgroundColor: rateColor }}
            />
          </div>
        </div>
      </div>

      {active && (
        <JobListModal
          label={active.label}
          color={active.color}
          jobs={active.jobs}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}
