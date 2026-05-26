import React, { useState, useMemo } from 'react';
import JobDrawer from './JobDrawer';
import { computeProductionHealth, BAND_CONFIG } from '../../utils/health.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const DEPT_META = [
  { key: 'channel_letters', label: 'Channel Letters', short: 'CL',    color: '#06b6d4' },
  { key: 'fabrication',     label: 'Fabrication',     short: 'Fab',   color: '#a855f7' },
  { key: 'vinyl_fco',       label: 'Vinyl & FCO',     short: 'Vinyl', color: '#f59e0b' },
  { key: 'outsourced',      label: 'Outsourced',       short: 'Out',   color: '#6b7280' },
];

const DEPT_BY_KEY = Object.fromEntries(DEPT_META.map(d => [d.key, d]));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns Mon–Fri (YYYY-MM-DD) for the ISO week containing `today`. */
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

/**
 * A job is "at risk" when it has at least one incomplete stage (sub-task)
 * whose due date has passed — meaning the work is behind schedule.
 */
function isAtRisk(job, today) {
  return job.subTasks.some(s => !s.completed && s.due_on && s.due_on <= today);
}

// ─── KPI card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }) {
  const cls = { success: 'text-success', danger: 'text-danger', warning: 'text-warning' }[color] ?? 'text-white';
  return (
    <div className="bg-slate-card border border-white/10 rounded-2xl p-6">
      <p className="text-white/40 text-[11px] font-semibold uppercase tracking-widest mb-3">{label}</p>
      <p className={`text-5xl font-bold tabular-nums leading-none ${cls}`}>{value ?? '—'}</p>
      {sub && <p className="text-white/30 text-xs mt-2">{sub}</p>}
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
      {/* Name + status dot */}
      <div className="flex items-start gap-2">
        <span className={`mt-[3px] w-2 h-2 rounded-full shrink-0 ${cfg.fillClass}`} />
        <span className="text-sm font-medium text-white leading-snug group-hover:text-white/90">
          {job.name}
        </span>
      </div>

      {/* Stage progress bar */}
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

      {/* Badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {dept && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
            style={{ backgroundColor: `${dept.color}22`, color: dept.color }}
          >
            {dept.short}
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
    </button>
  );
}

// ─── Department stage summary (bottom of each day column) ────────────────────

function DeptStageSummary({ subTasksByDept }) {
  const hasAny = DEPT_META.some(d => (subTasksByDept[d.key]?.length ?? 0) > 0);
  if (!hasAny) return null;

  return (
    <div className="space-y-2 pt-3 border-t border-white/[0.06]">
      <p className="text-[10px] text-white/25 uppercase tracking-widest font-semibold">Stages due</p>
      {DEPT_META.map(dept => {
        const tasks = subTasksByDept[dept.key] ?? [];
        if (tasks.length === 0) return null;
        const done = tasks.filter(t => t.completed).length;
        const overdue = tasks.filter(t => !t.completed && t.due_on).length;
        return (
          <div key={dept.key} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: dept.color }} />
              <span className="text-[11px] text-white/50 truncate">{dept.label}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-white/30 tabular-nums">{done}/{tasks.length}</span>
              {overdue > 0 && (
                <span className="text-[10px] text-danger tabular-nums font-semibold">({overdue} open)</span>
              )}
            </div>
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
      {/* Day header */}
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

      {/* Jobs */}
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

      {/* Department stage counts */}
      <div className="px-4 pb-4">
        <DeptStageSummary subTasksByDept={subTasksByDept} />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WeeklyOverview({ data, onSwitchToList }) {
  const [selectedJob, setSelectedJob] = useState(null);
  const today    = new Date().toISOString().slice(0, 10);
  const weekDays = useMemo(() => getWeekDays(today), [today]);

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
    const validDates = new Set(weekDays.map(d => d.date));
    const map = Object.fromEntries(weekDays.map(d => [d.date, []]));
    for (const job of annotatedJobs) {
      if (job.due_on && validDates.has(job.due_on)) map[job.due_on].push(job);
    }
    return map;
  }, [annotatedJobs, weekDays]);

  // Group sub-tasks by day → department (for the "stages due" footer)
  const subTasksByDay = useMemo(() => {
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
          map[st.due_on][job.department].push(st);
        }
      }
    }
    return map;
  }, [annotatedJobs, weekDays]);

  // ── KPI numbers ──
  const schedule     = data.schedule?.thisWeek;
  const weekJobsAll  = annotatedJobs.filter(j => j.due_on >= weekDays[0].date && j.due_on <= weekDays[4].date);
  const atRiskTotal  = weekJobsAll.filter(j => j._atRisk || j.status === 'late').length;
  const onTimeTotal  = schedule?.onTime ?? 0;
  const scheduledTotal = schedule?.scheduled ?? weekJobsAll.length;

  return (
    <div className="space-y-5">

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          label="Jobs This Week"
          value={scheduledTotal}
          sub="scheduled & in production"
        />
        <KpiCard
          label="On Time"
          value={onTimeTotal}
          sub="completed on schedule"
          color="success"
        />
        <KpiCard
          label="At Risk"
          value={atRiskTotal}
          sub="stages overdue or past due date"
          color={atRiskTotal > 0 ? 'danger' : undefined}
        />
      </div>

      {/* ── Legend + list-view toggle ── */}
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

      {/* ── Mon–Fri day columns ── */}
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

      {/* ── Job drawer ── */}
      {selectedJob && (
        <JobDrawer job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </div>
  );
}
