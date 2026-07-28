import React, { useState, useMemo } from 'react';
import JobDrawer from './JobDrawer';
import { computeProductionHealth, BAND_CONFIG } from '../../utils/health.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const DEPT_META = [
  { key: 'channel_letters', label: 'Channel Letters', short: 'CL',    color: '#06b6d4' },
  { key: 'fabrication',     label: 'Fabrication',     short: 'Fab',   color: '#a855f7' },
  { key: 'vinyl_fco',       label: 'Vinyl & FCO',     short: 'Vinyl', color: '#f59e0b' },
  { key: 'outsourced',      label: 'Outsourced',       short: 'Out',   color: '#6b7280' },
];

const DEPT_BY_KEY = Object.fromEntries(DEPT_META.map(d => [d.key, d]));

const PERIODS = [
  { id: 'thisWeek',    label: 'This Week',    isWeek: true  },
  { id: 'nextWeek',    label: 'Next Week',    isWeek: true  },
  { id: 'lastWeek',    label: 'Last Week',    isWeek: true  },
  { id: 'twoWeeksAgo', label: '2 Weeks Ago',  isWeek: true  },
  { id: 'thisMonth',   label: 'This Month',   isWeek: false },
  { id: 'lastMonth',   label: 'Last Month',   isWeek: false },
  { id: 'thisQuarter', label: 'This Quarter', isWeek: false },
  { id: 'q1',          label: 'Q1',           isWeek: false },
  { id: 'q2',          label: 'Q2',           isWeek: false },
  { id: 'q3',          label: 'Q3',           isWeek: false },
  { id: 'q4',          label: 'Q4',           isWeek: false },
];

const STATE_BADGE = {
  on_time:        { label: 'On Time',        cls: 'bg-success/20 text-success' },
  late:           { label: 'Late',           cls: 'bg-danger/20 text-danger' },
  in_progress:    { label: 'In Progress',    cls: 'bg-accent/20 text-accent' },
  overdue:        { label: 'Overdue',        cls: 'bg-orange-400/20 text-orange-400' },
  projected_late: { label: 'Projected Late', cls: 'bg-orange-400/20 text-orange-400' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWeekDays(today) {
  const d = new Date(today + 'T12:00:00Z');
  const dow = d.getUTCDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  return Array.from({ length: 5 }, (_, i) => {
    const day = new Date(d);
    day.setUTCDate(d.getUTCDate() + diffToMon + i);
    const iso = day.toISOString().slice(0, 10);
    return {
      date:   iso,
      label:  day.toLocaleDateString('en-US', { weekday: 'short',   timeZone: 'UTC' }),
      dayNum: day.toLocaleDateString('en-US', { day:     'numeric', timeZone: 'UTC' }),
      month:  day.toLocaleDateString('en-US', { month:   'short',   timeZone: 'UTC' }),
    };
  });
}

function formatDate(iso) {
  if (!iso) return 'No date';
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

/** Returns the first incomplete subTask name, or 'Complete' if all done. */
function currentStage(jobGid, jobMap) {
  const job = jobMap[jobGid];
  if (!job) return 'Complete';
  const incomplete = job.subTasks.filter(s => !s.completed);
  if (incomplete.length === 0) return 'Complete';
  // Return the first incomplete stage (chronological order they appear)
  return incomplete[0].name ?? 'In Progress';
}

function isAtRisk(job, today) {
  return job.subTasks.some(s => !s.completed && s.due_on && s.due_on <= today);
}

// ─── Alert card (large red numbers for critical attention items) ──────────────

function AlertCard({ label, value, sub, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-slate-card border rounded-2xl p-6 transition-all duration-150 ${
        active
          ? 'border-danger/50 ring-1 ring-danger/20'
          : value > 0
            ? 'border-danger/25 hover:border-danger/45'
            : 'border-white/10 hover:border-white/20'
      }`}
    >
      <p className="text-white/40 text-[11px] font-semibold uppercase tracking-widest mb-3">{label}</p>
      <p className={`text-6xl font-black tabular-nums leading-none ${value > 0 ? 'text-danger' : 'text-white/30'}`}>
        {value ?? 0}
      </p>
      {sub && <p className="text-white/30 text-xs mt-2">{sub}</p>}
      <p className={`text-[10px] mt-3 transition-colors ${active ? 'text-danger' : 'text-white/20'}`}>
        {active ? 'Click to collapse ↑' : 'Click to see jobs ↓'}
      </p>
    </button>
  );
}

// ─── KPI card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, active, onClick }) {
  const cls = { success: 'text-success', danger: 'text-danger', warning: 'text-warning' }[color] ?? 'text-white';
  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-slate-card border rounded-2xl p-6 transition-all duration-150 ${
        active
          ? 'border-accent/60 ring-1 ring-accent/30 bg-accent/[0.04]'
          : 'border-white/10 hover:border-white/20'
      }`}
    >
      <p className="text-white/40 text-[11px] font-semibold uppercase tracking-widest mb-3">{label}</p>
      <p className={`text-5xl font-bold tabular-nums leading-none ${cls}`}>{value ?? '—'}</p>
      {sub && <p className="text-white/30 text-xs mt-2">{sub}</p>}
      <p className={`text-[10px] mt-3 transition-colors ${active ? 'text-accent' : 'text-white/20'}`}>
        {active ? 'Click to collapse ↑' : 'Click to see jobs ↓'}
      </p>
    </button>
  );
}

// ─── Unreviewed job panel (shows promised date + days waiting) ────────────────

function UnreviewedJobPanel({ jobs, jobMap, onSelectJob }) {
  if (jobs.length === 0) {
    return (
      <div className="bg-slate-card border border-white/10 rounded-2xl p-8 text-center text-white/30 text-sm">
        No unreviewed jobs right now.
      </div>
    );
  }

  return (
    <div className="bg-slate-card border border-danger/30 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <p className="text-xs text-white/40 font-semibold uppercase tracking-widest">Unreviewed Jobs</p>
        <p className="text-xs text-white/30">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</p>
      </div>
      {/* Column headers */}
      <div className="px-5 py-2 border-b border-white/[0.04] grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center">
        <span className="text-[10px] text-white/25 font-semibold uppercase tracking-widest">Job</span>
        <span className="text-[10px] text-white/25 font-semibold uppercase tracking-widest text-right">Promised Date</span>
        <span className="text-[10px] text-white/25 font-semibold uppercase tracking-widest text-right">Prod Due</span>
        <span className="text-[10px] text-white/25 font-semibold uppercase tracking-widest text-right">Days Waiting</span>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {jobs.map(job => {
          const urgency = job.daysWaiting >= 7 ? 'text-danger' : job.daysWaiting >= 3 ? 'text-orange-400' : 'text-white/50';
          return (
            <button
              key={job.gid}
              onClick={() => {
                const full = jobMap[job.gid];
                if (full) onSelectJob(full);
              }}
              className="w-full text-left px-5 py-3.5 hover:bg-white/[0.03] transition-colors grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{job.name}</p>
              </div>
              <div className="text-right shrink-0">
                {job.promisedDate
                  ? <span className="text-[11px] text-warning font-semibold">{formatDate(job.promisedDate)}</span>
                  : <span className="text-[11px] text-white/20">—</span>}
              </div>
              <div className="text-right shrink-0">
                {job.due_on
                  ? <span className="text-[11px] text-white/50">{formatDate(job.due_on)}</span>
                  : <span className="text-[11px] text-white/20">—</span>}
              </div>
              <div className="text-right shrink-0">
                <span className={`text-sm font-bold tabular-nums ${urgency}`}>
                  {job.daysWaiting}d
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Inline job panel ─────────────────────────────────────────────────────────

function JobPanel({ jobs, jobMap, onSelectJob, accentColor }) {
  const borderCls = accentColor === 'danger' ? 'border-danger/30' : 'border-accent/20';
  if (jobs.length === 0) {
    return (
      <div className="bg-slate-card border border-white/10 rounded-2xl p-8 text-center text-white/30 text-sm">
        No jobs for this metric in the selected period.
      </div>
    );
  }

  return (
    <div className={`bg-slate-card border ${borderCls} rounded-2xl overflow-hidden`}>
      <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <p className="text-xs text-white/40 font-semibold uppercase tracking-widest">Jobs</p>
        <p className="text-xs text-white/30">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {jobs.map(job => {
          const badge = STATE_BADGE[job.state] ?? STATE_BADGE.in_progress;
          const stage = currentStage(job.gid, jobMap);
          const isDone = job.state === 'on_time' || job.state === 'late';
          return (
            <button
              key={job.gid}
              onClick={() => {
                const full = jobMap[job.gid];
                if (full) onSelectJob(full);
              }}
              className={`w-full text-left px-5 py-3.5 hover:bg-white/[0.03] transition-colors flex items-center gap-4 ${isDone ? 'opacity-60' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${isDone ? 'text-white/60 line-through decoration-white/20' : 'text-white'}`}>{job.name}</p>
                <p className="text-[11px] text-white/40 mt-0.5 font-medium">{formatDate(job.due_on)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!isDone && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold truncate max-w-[140px]"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                    {stage}
                  </span>
                )}
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>
                  {badge.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Job card (inside a day column) ──────────────────────────────────────────

function JobCard({ job, today, onClick }) {
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
      className={`w-full text-left rounded-xl border ${cfg.borderClass} bg-white/[0.025] hover:bg-white/[0.055] transition-all duration-150 p-3 space-y-2.5 group`}
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
      </div>

      {/* Job name */}
      <div className="flex items-start gap-2">
        <span className={`mt-[3px] w-2 h-2 rounded-full shrink-0 ${cfg.fillClass}`} />
        <span className="text-sm font-medium text-white leading-snug group-hover:text-white/90">
          {job.name}
        </span>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="space-y-1">
          <div className="h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/30">{completed}/{total} stages</span>
            {overdue > 0 && (
              <span className="text-[10px] text-danger font-semibold">{overdue} overdue</span>
            )}
          </div>
        </div>
      )}
    </button>
  );
}

// ─── Department stage summary (bottom of each day column) ────────────────────

function DeptStageSummary({ subTasksByDept }) {
  const hasAny = DEPT_META.some(d => (subTasksByDept[d.key]?.length ?? 0) > 0);
  const [expandedDept, setExpandedDept] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  if (!hasAny) return null;

  return (
    <div className="space-y-2 pt-3 border-t border-white/[0.06]">
      <p className="text-[10px] text-white/25 uppercase tracking-widest font-semibold">Stages due — click to see tasks</p>
      {DEPT_META.map(dept => {
        const tasks = subTasksByDept[dept.key] ?? [];
        if (tasks.length === 0) return null;
        const done = tasks.filter(t => t.completed).length;
        const openTasks = tasks.filter(t => !t.completed);
        const isExpanded = expandedDept === dept.key;
        return (
          <div key={dept.key}>
            <button
              className="w-full flex items-center justify-between gap-2 hover:bg-white/[0.04] rounded px-1 -mx-1 py-0.5 transition-colors"
              onClick={() => setExpandedDept(isExpanded ? null : dept.key)}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dept.color }} />
                <span className="text-[11px] text-white/50 truncate">{dept.label}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] text-white/30 tabular-nums">{done}/{tasks.length}</span>
                {openTasks.length > 0 && (
                  <span className="text-[10px] text-danger tabular-nums font-semibold">({openTasks.length} open)</span>
                )}
                <span className="text-white/20 text-[10px]">{isExpanded ? '▲' : '▼'}</span>
              </div>
            </button>
            {isExpanded && (
              <div className="ml-3 mt-1 space-y-1.5 border-l border-white/[0.06] pl-2">
                {tasks.map((t, i) => (
                  <div key={t.gid || i}>
                    <button
                      className="w-full text-left block hover:bg-white/[0.04] rounded px-1 -mx-1 py-1 transition-colors cursor-pointer"
                      onClick={() => setSelectedTask(selectedTask?.gid === t.gid ? null : t)}
                    >
                      <div className="flex items-start gap-2 text-[11px]">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${t.completed ? 'bg-success' : 'bg-danger'}`} />
                        <div className="min-w-0 flex-1">
                          <span className={`block text-wrap break-words ${t.completed ? 'text-white/30 line-through' : 'text-white/70'}`}>
                            {t.name}
                          </span>
                          {t.assignee && (
                            <span className="text-white/25 text-[10px]">{t.assignee}</span>
                          )}
                        </div>
                        {t.completed && t.completed_at && (
                          <span className="text-success/60 shrink-0 text-[10px]">✓</span>
                        )}
                      </div>
                    </button>
                    {/* Inline detail dialog */}
                    {selectedTask?.gid === t.gid && (
                      <div className="ml-4 mt-1 mb-2 bg-white/[0.06] border border-white/10 rounded-lg p-3 space-y-2">
                        {t._parentName && (
                          <div>
                            <span className="text-[9px] uppercase tracking-wider text-white/30">Main Job</span>
                            <p className="text-[11px] text-white/80 font-medium">{t._parentName}</p>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
                          <div>
                            <span className="text-white/30">Status: </span>
                            <span className={t.completed ? 'text-success' : 'text-danger'}>
                              {t.completed ? 'Complete' : 'Open'}
                            </span>
                          </div>
                          {t.assignee && (
                            <div>
                              <span className="text-white/30">Assigned: </span>
                              <span className="text-white/60">{t.assignee}</span>
                            </div>
                          )}
                          {t.due_on && (
                            <div>
                              <span className="text-white/30">Due: </span>
                              <span className="text-white/60">{t.due_on}</span>
                            </div>
                          )}
                          {t.completed_at && (
                            <div>
                              <span className="text-white/30">Done: </span>
                              <span className="text-white/60">{t.completed_at.slice(0, 10)}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 pt-1">
                          {t.gid && (
                            <a
                              href={`https://app.asana.com/0/0/${t.gid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-accent hover:underline"
                            >
                              Open subtask in Asana ↗
                            </a>
                          )}
                          {t._parentGid && (
                            <a
                              href={`https://app.asana.com/0/0/${t._parentGid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] text-white/40 hover:text-white/70 hover:underline"
                            >
                              Open main job ↗
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Day column ───────────────────────────────────────────────────────────────

function DayColumn({ day, jobs, subTasksByDept, isToday, today, onSelectJob }) {
  const atRiskCount = jobs.filter(j => j._atRisk || j.status === 'late').length;

  return (
    <div
      className={`rounded-2xl border flex flex-col gap-0 overflow-hidden ${
        isToday
          ? 'border-accent/50 bg-accent/[0.04]'
          : 'border-white/10 bg-slate-card'
      }`}
    >
      <div className={`px-4 pt-4 pb-3 ${isToday ? 'border-b border-accent/20' : 'border-b border-white/[0.06]'}`}>
        <div className="flex items-center justify-between mb-1">
          <span className={`text-[11px] font-bold uppercase tracking-widest ${isToday ? 'text-accent' : 'text-white/35'}`}>
            {day.label}
          </span>
          {isToday && (
            <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-semibold">
              Today
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-3xl font-bold leading-none ${isToday ? 'text-white' : 'text-white/75'}`}>
            {day.dayNum}
          </span>
          <span className="text-sm text-white/25">{day.month}</span>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[11px] text-white/40">
            {jobs.length} job{jobs.length !== 1 ? 's' : ''}
          </span>
          {atRiskCount > 0 && (
            <>
              <span className="text-white/20">·</span>
              <span className="text-[11px] text-danger font-semibold">
                {atRiskCount} at risk
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 p-3 space-y-2">
        {jobs.length === 0 ? (
          <p className="text-white/15 text-xs text-center py-6">No jobs due</p>
        ) : (
          jobs.map(job => (
            <JobCard
              key={job.gid}
              job={job}
              today={today}
              onClick={() => onSelectJob(job)}
            />
          ))
        )}
      </div>

      <div className="px-4 pb-4">
        <DeptStageSummary subTasksByDept={subTasksByDept} />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WeeklyOverview({ data, onSwitchToList }) {
  const [selectedJob,  setSelectedJob]  = useState(null);
  const [activePeriod, setActivePeriod] = useState('thisWeek');
  const [activeCard,   setActiveCard]   = useState(null); // 'scheduled' | 'onTime' | 'atRisk'
  const [activeAlert,  setActiveAlert]  = useState(null); // 'rollover' | 'unreviewed'

  const today    = new Date().toISOString().slice(0, 10);
  const periodCfg = PERIODS.find(p => p.id === activePeriod) ?? PERIODS[0];

  // Only show weekly calendar for week-type periods
  const showCalendar = periodCfg.isWeek;

  // Week days (for calendar view)
  const weekDays = useMemo(() => {
    if (!showCalendar) return [];
    if (activePeriod === 'lastWeek') {
      const d = new Date(today + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - 7);
      return getWeekDays(d.toISOString().slice(0, 10));
    }
    if (activePeriod === 'twoWeeksAgo') {
      const d = new Date(today + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - 14);
      return getWeekDays(d.toISOString().slice(0, 10));
    }
    if (activePeriod === 'nextWeek') {
      const d = new Date(today + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + 7);
      return getWeekDays(d.toISOString().slice(0, 10));
    }
    return getWeekDays(today);
  }, [activePeriod, showCalendar, today]);

  // Build jobMap from data.jobs for stage lookup
  const jobMap = useMemo(() =>
    Object.fromEntries(data.jobs.map(j => [j.gid, j])),
  [data.jobs]);

  // Annotate every job with health + at-risk flag
  const annotatedJobs = useMemo(() =>
    data.jobs.map(job => ({
      ...job,
      _health: computeProductionHealth(job, today),
      _atRisk: isAtRisk(job, today),
    })),
  [data.jobs, today]);

  // Group annotated jobs by their due_on date (within this week only)
  const jobsByDay = useMemo(() => {
    if (!showCalendar) return {};
    const validDates = new Set(weekDays.map(d => d.date));
    const map = Object.fromEntries(weekDays.map(d => [d.date, []]));
    for (const job of annotatedJobs) {
      if (job.due_on && validDates.has(job.due_on)) map[job.due_on].push(job);
    }
    return map;
  }, [annotatedJobs, weekDays, showCalendar]);

  // Group sub-tasks by day → department
  const subTasksByDay = useMemo(() => {
    if (!showCalendar) return {};
    const validDates = new Set(weekDays.map(d => d.date));
    const map = Object.fromEntries(
      weekDays.map(d => [
        d.date,
        Object.fromEntries(DEPT_META.map(dept => [dept.key, []])),
      ])
    );
    for (const job of annotatedJobs) {
      for (const st of job.subTasks) {
        if (st.due_on && validDates.has(st.due_on)) {
          map[st.due_on][job.department].push({ ...st, _parentName: job.name, _parentGid: job.gid });
        }
      }
    }
    return map;
  }, [annotatedJobs, weekDays, showCalendar]);

  // Schedule stats for the active period
  const schedule   = data.schedule?.[activePeriod] ?? {};
  const scheduledTotal = schedule.scheduled ?? 0;
  const onTimeTotal    = schedule.onTime    ?? 0;

  // Projected-late jobs: in-progress within the period whose sub-tasks are already overdue
  const projectedLateInPeriod = useMemo(() => {
    if (!schedule.jobs) return [];
    return schedule.jobs.filter(j => j.state === 'in_progress' && jobMap[j.gid]?.projectedLate);
  }, [schedule.jobs, jobMap]);

  const atRiskTotal = (schedule.late ?? 0) + projectedLateInPeriod.length;

  // Late open orders: active jobs past their due date — this number should be zero
  const rolloverJobs = useMemo(() =>
    data.jobs
      .filter(j => j.due_on && j.due_on < today)
      .map(j => ({ gid: j.gid, name: j.name, due_on: j.due_on, state: 'overdue' })),
  [data.jobs, today]);

  // Unreviewed jobs: still in the Unreviewed section (not yet triaged)
  const unreviewedJobs = useMemo(() => {
    return data.jobs
      .filter(j => !j.reviewed)
      .map(j => {
        const ref = j.createdAt ?? j.startDate ?? null;
        const daysWaiting = ref
          ? Math.max(0, Math.floor((new Date(today) - new Date(ref)) / 86400000))
          : 0;
        return {
          gid: j.gid,
          name: j.name,
          due_on: j.due_on,
          promisedDate: j.promisedDate ?? null,
          daysWaiting,
          state: 'in_progress',
        };
      })
      .sort((a, b) => b.daysWaiting - a.daysWaiting);
  }, [data.jobs, today]);

  // Not-processed jobs: reviewed but only has 1 subtask assigned to Fernando.
  // Fernando gets a single "crear subtareas" task to build the production
  // breakdown. If the only subtask is his, the job hasn't been processed yet.
  // Jobs with 0 subtasks OR 1 subtask assigned to someone else (e.g. Eduardo
  // doing fabrication) are NOT counted — those are either empty or already
  // in production with a real task.
  const notProcessedJobs = useMemo(() => {
    return data.jobs
      .filter(j => {
        if (!j.reviewed) return false;
        if (j.subTasks.length === 0) return true; // no subtasks at all
        if (j.subTasks.length === 1) {
          const assignee = (j.subTasks[0].assignee || '').toLowerCase();
          return assignee.includes('fernando');
        }
        return false;
      })
      .map(j => {
        const ref = j.createdAt ?? j.startDate ?? null;
        const daysWaiting = ref
          ? Math.max(0, Math.floor((new Date(today) - new Date(ref)) / 86400000))
          : 0;
        return {
          gid: j.gid,
          name: j.name,
          due_on: j.due_on,
          promisedDate: j.promisedDate ?? null,
          daysWaiting,
          state: 'in_progress',
          subTaskCount: j.subTasks.length,
        };
      })
      .sort((a, b) => b.daysWaiting - a.daysWaiting);
  }, [data.jobs, today]);

  // Jobs to show in alert panels
  const alertPanelJobs = useMemo(() => {
    if (activeAlert === 'rollover') return rolloverJobs;
    if (activeAlert === 'unreviewed') return unreviewedJobs;
    if (activeAlert === 'notprocessed') return notProcessedJobs;
    return [];
  }, [activeAlert, rolloverJobs, unreviewedJobs, notProcessedJobs]);

  // Jobs to show in the inline panel (filtered by which card is open)
  const panelJobs = useMemo(() => {
    if (!activeCard || !schedule.jobs) return [];
    if (activeCard === 'scheduled') return schedule.jobs;
    if (activeCard === 'onTime')    return schedule.jobs.filter(j => j.state === 'on_time');
    if (activeCard === 'atRisk') {
      const lateOrOverdue = schedule.jobs.filter(j => j.state === 'overdue' || j.state === 'late');
      const projLate = projectedLateInPeriod.map(j => ({ ...j, state: 'projected_late' }));
      return [...lateOrOverdue, ...projLate];
    }
    return [];
  }, [activeCard, schedule.jobs, projectedLateInPeriod]);

  function toggleCard(card) {
    setActiveAlert(null);
    setActiveCard(prev => prev === card ? null : card);
  }

  function toggleAlert(alert) {
    setActiveCard(null);
    setActiveAlert(prev => prev === alert ? null : alert);
  }

  return (
    <div className="space-y-5">

      {/* ── Needs Attention alerts ── */}
      <div className="grid grid-cols-3 gap-4">
        <AlertCard
          label="Late Open Orders"
          value={rolloverJobs.length}
          sub="past due date — should be zero"
          active={activeAlert === 'rollover'}
          onClick={() => toggleAlert('rollover')}
        />
        <AlertCard
          label="Unreviewed"
          value={unreviewedJobs.length}
          sub="jobs not yet triaged from intake"
          active={activeAlert === 'unreviewed'}
          onClick={() => toggleAlert('unreviewed')}
        />
        <AlertCard
          label="Not Processed"
          value={notProcessedJobs.length}
          sub="reviewed but no production breakdown yet (≤1 subtask)"
          active={activeAlert === 'notprocessed'}
          onClick={() => toggleAlert('notprocessed')}
        />
      </div>

      {/* ── Alert panel ── */}
      {activeAlert === 'rollover' && (
        <JobPanel
          jobs={alertPanelJobs}
          jobMap={jobMap}
          onSelectJob={setSelectedJob}
          accentColor="danger"
        />
      )}
      {activeAlert === 'unreviewed' && (
        <UnreviewedJobPanel
          jobs={unreviewedJobs}
          jobMap={jobMap}
          onSelectJob={setSelectedJob}
        />
      )}
      {activeAlert === 'notprocessed' && (
        <UnreviewedJobPanel
          jobs={notProcessedJobs}
          jobMap={jobMap}
          onSelectJob={setSelectedJob}
        />
      )}

      {/* ── Period selector ── */}
      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => { setActivePeriod(p.id); setActiveCard(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activePeriod === p.id
                ? 'bg-accent text-white'
                : 'bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          label="Jobs Scheduled"
          value={scheduledTotal}
          sub="total jobs in period"
          active={activeCard === 'scheduled'}
          onClick={() => toggleCard('scheduled')}
        />
        <KpiCard
          label="On Time"
          value={onTimeTotal}
          sub="completed on schedule"
          color="success"
          active={activeCard === 'onTime'}
          onClick={() => toggleCard('onTime')}
        />
        <KpiCard
          label="At Risk / Late"
          value={atRiskTotal}
          sub="overdue or past due date"
          color={atRiskTotal > 0 ? 'danger' : undefined}
          active={activeCard === 'atRisk'}
          onClick={() => toggleCard('atRisk')}
        />
      </div>

      {/* ── Inline job panel ── */}
      {activeCard && (
        <JobPanel
          jobs={panelJobs}
          jobMap={jobMap}
          onSelectJob={setSelectedJob}
        />
      )}

      {/* ── Next Week Forecast strip ── */}
      {activePeriod !== 'nextWeek' && (() => {
        const nw = data.schedule?.nextWeek ?? {};
        const nwScheduled = nw.scheduled ?? 0;
        const nwOnTime    = nw.onTime    ?? 0;
        const nwAtRisk    = nw.late      ?? 0;
        return (
          <div className="bg-slate-card border border-white/[0.07] rounded-2xl px-5 py-4 flex items-center gap-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30 shrink-0">
              Next Week Forecast
            </p>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold tabular-nums text-white">{nwScheduled}</span>
                <span className="text-[11px] text-white/35">scheduled</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold tabular-nums text-success">{nwOnTime}</span>
                <span className="text-[11px] text-white/35">on time</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-bold tabular-nums ${nwAtRisk > 0 ? 'text-danger' : 'text-white/40'}`}>{nwAtRisk}</span>
                <span className="text-[11px] text-white/35">at risk</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Legend + list-view toggle (week periods only) ── */}
      {showCalendar && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {[
              { label: 'Healthy',  cls: 'bg-success' },
              { label: 'Watch',    cls: 'bg-yellow-400' },
              { label: 'At Risk',  cls: 'bg-orange-400' },
              { label: 'Critical', cls: 'bg-danger' },
            ].map(({ label, cls }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${cls}`} />
                <span className="text-[11px] text-white/40">{label}</span>
              </div>
            ))}
          </div>
          <button
            onClick={onSwitchToList}
            className="text-[11px] text-white/35 hover:text-white/60 transition-colors"
          >
            List view →
          </button>
        </div>
      )}

      {/* ── Mon–Fri day columns (week periods only) ── */}
      {showCalendar && (
        <div className="grid grid-cols-5 gap-3 items-start">
          {weekDays.map(day => (
            <DayColumn
              key={day.date}
              day={day}
              jobs={jobsByDay[day.date] ?? []}
              subTasksByDept={subTasksByDay[day.date] ?? {}}
              isToday={day.date === today}
              today={today}
              onSelectJob={setSelectedJob}
            />
          ))}
        </div>
      )}

      {/* ── Job drawer ── */}
      {selectedJob && (
        <JobDrawer job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </div>
  );
}
