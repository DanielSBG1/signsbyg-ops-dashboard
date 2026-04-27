import React, { useState } from 'react';
import JobDrawer from './JobDrawer';
import { computeProductionHealth, avgHealth, sortByHealth, BAND_CONFIG, scoreToBand } from '../../utils/health.js';

const DEPT_ORDER = ['channel_letters', 'fabrication', 'vinyl_fco', 'outsourced'];
const DEPT_LABELS = {
  channel_letters: 'Channel Letters',
  fabrication:     'Fabrication',
  vinyl_fco:       'Vinyl & FCO',
  outsourced:      'Outsourced',
};

function HealthBar({ score, band }) {
  if (score === null) return <span className="text-white/30 text-xs">—</span>;
  const cfg = BAND_CONFIG[band];
  return (
    <div className="flex items-center gap-2 flex-1 max-w-[160px]">
      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${cfg.fillClass}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${cfg.textClass}`}>{score}%</span>
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${cfg.borderClass} ${cfg.textClass}`}>
        {cfg.label.toUpperCase()}
      </span>
    </div>
  );
}

function JobRow({ job, onOpen }) {
  const isLate = job.status === 'late';
  const cfg = BAND_CONFIG[job._health.band];

  return (
    <div
      className="px-4 py-2.5 flex items-center gap-3 hover:bg-white/[0.04] cursor-pointer transition-colors border-b border-white/[0.03] last:border-0"
      onClick={() => onOpen(job)}
    >
      {/* Health score badge */}
      <span className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold border ${cfg.borderClass} ${cfg.badgeBgClass} ${cfg.textClass}`}>
        {job._health.score ?? '—'}
      </span>

      {/* Job name + flags */}
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium truncate">{job.name}</span>
        {job.redoType && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 font-bold shrink-0">
            REDO
          </span>
        )}
        {job.projectedLate && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-bold shrink-0">
            ⚠ PROJ. LATE
          </span>
        )}
        {isLate && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/20 text-danger font-bold shrink-0">
            LATE
          </span>
        )}
      </div>

      {/* Due date */}
      {job.due_on && (
        <span className={`shrink-0 text-xs tabular-nums ${isLate ? 'text-danger' : 'text-white/40'}`}>
          {job.due_on}
        </span>
      )}
    </div>
  );
}

function DepartmentModule({ deptKey, jobs, today, onOpenDrawer }) {
  const [expanded, setExpanded] = useState(false);

  const scoredJobs = jobs.map(j => ({ ...j, _health: computeProductionHealth(j, today) }));
  const sortedJobs = sortByHealth(scoredJobs);
  const avg = avgHealth(scoredJobs);
  const avgBand = scoreToBand(avg);
  const lateCount = jobs.filter(j => j.status === 'late').length;

  return (
    <div className="bg-white/[0.03] rounded-xl overflow-hidden">
      {/* Header */}
      <button
        className="w-full px-4 py-3 flex items-center gap-4 hover:bg-white/[0.05] transition-colors text-left"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Dept name + job count */}
        <span className="font-semibold text-sm text-white/90 shrink-0 w-36">
          {DEPT_LABELS[deptKey]}
        </span>
        <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-white/50 tabular-nums shrink-0">
          {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
        </span>

        {/* Health bar */}
        <div className="flex-1">
          <HealthBar score={avg} band={avgBand} />
        </div>

        {/* Late count badge */}
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold tabular-nums ${
          lateCount > 0 ? 'bg-danger/20 text-danger' : 'bg-white/10 text-white/30'
        }`}>
          {lateCount} late
        </span>

        {/* Chevron */}
        <span className="shrink-0 text-white/30 text-xs">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Expanded job rows */}
      {expanded && (
        <div className="border-t border-white/5">
          {sortedJobs.length === 0 && (
            <p className="px-4 py-6 text-center text-white/20 text-sm">No jobs</p>
          )}
          {sortedJobs.map(job => (
            <JobRow key={job.gid} job={job} onOpen={onOpenDrawer} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DepartmentLoadTab({ data }) {
  const [drawerJob, setDrawerJob] = useState(null);
  const today = new Date().toISOString().slice(0, 10);
  const { departmentLoad } = data;

  return (
    <div className="space-y-3">
      {DEPT_ORDER.map(key => (
        <DepartmentModule
          key={key}
          deptKey={key}
          jobs={departmentLoad[key] ?? []}
          today={today}
          onOpenDrawer={setDrawerJob}
        />
      ))}

      {drawerJob && (
        <JobDrawer job={drawerJob} onClose={() => setDrawerJob(null)} />
      )}
    </div>
  );
}
