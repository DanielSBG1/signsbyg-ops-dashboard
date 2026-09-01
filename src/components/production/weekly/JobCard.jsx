import React from 'react';
import { BAND_CONFIG } from '../../../utils/health.js';

const DEPT_META = [
  { key: 'channel_letters', label: 'Channel Letters', short: 'CL',    color: '#06b6d4' },
  { key: 'fabrication',     label: 'Fabrication',     short: 'Fab',   color: '#a855f7' },
  { key: 'vinyl_fco',       label: 'Vinyl & FCO',     short: 'Vinyl', color: '#f59e0b' },
  { key: 'outsourced',      label: 'Outsourced',       short: 'Out',   color: '#6b7280' },
];

const DEPT_BY_KEY = Object.fromEntries(DEPT_META.map(d => [d.key, d]));

/**
 * JobCard \u2014 individual job card rendered inside a day column.
 *
 * Props:
 *   job     {object}  \u2014 annotated job (with _health, subTasks, etc.)
 *   today   {string}  \u2014 ISO date string 'YYYY-MM-DD'
 *   onClick {() => void}
 */
export default function JobCard({ job, today, onClick }) {
  const { band } = job._health;
  const cfg  = BAND_CONFIG[band];
  const dept = DEPT_BY_KEY[job.department];

  const total     = job.subTasks.length;
  const completed = job.subTasks.filter(s => s.completed).length;
  const overdue   = job.subTasks.filter(s => !s.completed && s.due_on && s.due_on <= today).length;
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border ${
        job.driftSeverity === 'severe' ? 'border-danger/40 bg-danger/5' :
        job.driftSeverity === 'moderate' ? 'border-orange-400/40 bg-orange-50' :
        job.driftSeverity === 'mild' ? 'border-warning/40 bg-amber-50' :
        `${cfg.borderClass} bg-black/[0.02]`
      } hover:bg-black/[0.03] transition-all duration-150 p-3 space-y-2.5 group`}
    >
      {/* Department + status badges at top */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {dept && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
            style={{ backgroundColor: `${dept.color}22`, color: dept.color }}
          >
            {dept.label}
          </span>
        )}
        {job.status === 'late' && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-danger/20 text-danger font-semibold">
            Late
          </span>
        )}
        {job.redoType && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-400/20 text-orange-400 font-semibold">
            Redo
          </span>
        )}
        {job.isRescheduled && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold tabular-nums ${
            job.driftSeverity === 'severe' ? 'bg-danger/20 text-danger' :
            job.driftSeverity === 'moderate' ? 'bg-orange-400/20 text-orange-500' :
            'bg-warning/20 text-warning'
          }`}>
            \u21bb +{job.driftDays}d
          </span>
        )}
      </div>

      {/* Job name */}
      <div className="flex items-start gap-2">
        <span className={`mt-[3px] w-2 h-2 rounded-full shrink-0 ${cfg.fillClass}`} />
        <span className="text-sm font-medium text-gray-900 leading-snug group-hover:text-gray-900">
          {job.name}
        </span>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="space-y-1">
          <div className="h-1 rounded-full bg-black/[0.05] overflow-hidden">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">{completed}/{total} stages</span>
            {overdue > 0 && (
              <span className="text-[10px] text-danger font-semibold">{overdue} overdue</span>
            )}
          </div>
        </div>
      )}
    </button>
  );
}
