import React, { useState, useMemo } from 'react';
import JobsTable from './JobsTable';
import IntakeCard from './IntakeCard';

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIODS = [
  { id: 'thisWeek',    label: 'This Week'     },
  { id: 'lastWeek',    label: 'Last Week'     },
  { id: 'monthToDate', label: 'Month to Date' },
];

const CALENDAR_WEEK_LABELS = ['This Week', 'Next Week', 'In 2 Weeks'];

const STATUS_BADGE = {
  early:       { label: 'Early',       cls: 'bg-success/20 text-success' },
  on_time:     { label: 'On Time',     cls: 'bg-success/20 text-success' },
  scheduled:   { label: 'Scheduled',   cls: 'bg-accent/20 text-accent' },
  in_progress: { label: 'Upcoming',    cls: 'bg-accent/20 text-accent' },
  pending:     { label: 'No Date',     cls: 'bg-white/10 text-white/40' },
  late:        { label: 'Late',        cls: 'bg-danger/20 text-danger' },
  overdue:     { label: 'Overdue',     cls: 'bg-danger/20 text-danger' },
  rescheduled: { label: 'Rescheduled', cls: 'bg-warning/20 text-warning' },
  failed:      { label: 'Failed',      cls: 'bg-danger/20 text-danger' },
};

// Border + dot color for each status (used on calendar job cards)
const STATUS_CARD = {
  early:       { borderClass: 'border-success/30',   dotClass: 'bg-success'    },
  on_time:     { borderClass: 'border-success/30',   dotClass: 'bg-success'    },
  scheduled:   { borderClass: 'border-white/10',     dotClass: 'bg-accent'     },
  pending:     { borderClass: 'border-white/[0.07]', dotClass: 'bg-white/20'   },
  late:        { borderClass: 'border-danger/40',    dotClass: 'bg-danger'     },
  rescheduled: { borderClass: 'border-warning/30',   dotClass: 'bg-warning'    },
  failed:      { borderClass: 'border-danger/40',    dotClass: 'bg-danger'     },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

// ─── Alert card ───────────────────────────────────────────────────────────────

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

// ─── KPI card ─────────────────────────────────────────────────────────────────

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

// ─── Job panel (expandable list from alert / KPI clicks) ──────────────────────

function JobPanel({ jobs, accentColor }) {
  const borderCls = accentColor === 'danger' ? 'border-danger/30' : 'border-accent/20';
  if (jobs.length === 0) {
    return (
      <div className="bg-slate-card border border-white/10 rounded-2xl p-8 text-center text-white/30 text-sm">
        No jobs for this selection.
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
        {jobs.map((job, i) => {
          const status = job.status ?? job.state ?? 'pending';
          const badge  = STATUS_BADGE[status] ?? STATUS_BADGE.pending;
          const crews  = Array.isArray(job.crews) ? job.crews.join(', ') : null;
          const meta   = [crews, job.section].filter(Boolean).join(' · ');
          return (
            <a
              key={job.id ?? i}
              href={job.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{job.name}</p>
                {meta && <p className="text-[11px] text-white/40 mt-0.5">{meta}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-white/40 tabular-nums">{formatDate(job.installDate)}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>{badge.label}</span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ─── Calendar: install job card ───────────────────────────────────────────────

function InstallJobCard({ job }) {
  const cfg   = STATUS_CARD[job.status] ?? STATUS_CARD.scheduled;
  const crews = Array.isArray(job.crews) ? job.crews : [];
  const isDone = job.status === 'on_time' || job.status === 'early';
  return (
    <a
      href={job.url}
      target="_blank"
      rel="noreferrer"
      className={`block rounded-xl border ${cfg.borderClass} bg-white/[0.025] hover:bg-white/[0.055] transition-all duration-150 p-3 space-y-2 group`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-[3px] w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} />
        <span className={`text-sm font-medium leading-snug group-hover:text-white/90 ${isDone ? 'text-white/50 line-through decoration-white/20' : 'text-white'}`}>
          {job.name}
        </span>
      </div>
      {crews.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pl-4">
          {crews.map(crew => (
            <span key={crew} className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-white/10 text-white/50">
              {crew}
            </span>
          ))}
          {job.status === 'late' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-danger/20 text-danger font-semibold">Late</span>
          )}
          {job.status === 'rescheduled' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/20 text-warning font-semibold">Rescheduled</span>
          )}
        </div>
      )}
    </a>
  );
}

// ─── Calendar: crew day summary (bottom of day column) ────────────────────────

function CrewDaySummary({ jobs, crewColorMap }) {
  const crewMap = {};
  for (const job of jobs) {
    for (const crew of (job.crews ?? [])) {
      if (!crewMap[crew]) crewMap[crew] = [];
      crewMap[crew].push(job);
    }
  }
  const crews = Object.keys(crewMap);
  if (crews.length === 0) return null;
  return (
    <div className="space-y-2.5 pt-3 border-t border-white/[0.06]">
      <p className="text-[10px] text-white/25 uppercase tracking-widest font-semibold">By crew</p>
      {crews.map(crew => {
        const crewJobs = crewMap[crew];
        const done  = crewJobs.filter(j => j.status === 'on_time' || j.status === 'early').length;
        const late  = crewJobs.filter(j => j.status === 'late' || j.status === 'failed').length;
        const sched = crewJobs.filter(j => j.status === 'scheduled' || j.status === 'rescheduled').length;
        const color = crewColorMap[crew] ?? '#6b7280';
        return (
          <div key={crew} className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[11px] text-white/50 truncate">{crew}</span>
            </div>
            <div className="flex items-center gap-2 pl-3">
              {done  > 0 && <span className="text-[10px] tabular-nums font-semibold text-success">{done} done</span>}
              {late  > 0 && <span className="text-[10px] tabular-nums font-semibold text-danger">{late} late</span>}
              {sched > 0 && <span className="text-[10px] tabular-nums font-semibold text-accent">{sched} scheduled</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Calendar: day column ─────────────────────────────────────────────────────

function DayColumn({ day, jobs, isToday, crewColorMap }) {
  const lateCount = jobs.filter(j => j.status === 'late' || j.status === 'failed').length;
  return (
    <div className={`rounded-2xl border flex flex-col gap-0 overflow-hidden ${
      isToday ? 'border-accent/50 bg-accent/[0.04]' : 'border-white/10 bg-slate-card'
    }`}>
      <div className={`px-4 pt-4 pb-3 ${isToday ? 'border-b border-accent/20' : 'border-b border-white/[0.06]'}`}>
        <div className="flex items-center justify-between mb-1">
          <span className={`text-[11px] font-bold uppercase tracking-widest ${isToday ? 'text-accent' : 'text-white/35'}`}>
            {day.label}
          </span>
          {isToday && <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-semibold">Today</span>}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-3xl font-bold leading-none ${isToday ? 'text-white' : 'text-white/75'}`}>{day.dayNum}</span>
          <span className="text-sm text-white/25">{day.month}</span>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[11px] text-white/40">{jobs.length} install{jobs.length !== 1 ? 's' : ''}</span>
          {lateCount > 0 && (
            <>
              <span className="text-white/20">·</span>
              <span className="text-[11px] text-danger font-semibold">{lateCount} late</span>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 p-3 space-y-2">
        {jobs.length === 0
          ? <p className="text-white/15 text-xs text-center py-6">No installs</p>
          : jobs.map((job, i) => <InstallJobCard key={job.id ?? i} job={job} />)
        }
      </div>
      <div className="px-4 pb-4">
        <CrewDaySummary jobs={jobs} crewColorMap={crewColorMap} />
      </div>
    </div>
  );
}

// ─── Section pipeline ─────────────────────────────────────────────────────────

function SectionPipelinePanel({ bySection }) {
  if (!bySection || bySection.length === 0) return null;
  const max = Math.max(...bySection.map(s => s.count), 1);
  return (
    <div className="bg-slate-card border border-white/10 rounded-2xl p-6">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-5">Pipeline by Section</p>
      <div className="space-y-3">
        {bySection.map(s => (
          <div key={s.gid} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">{s.name}</span>
              <span className="text-xs font-semibold text-white/70 tabular-nums">{s.count}</span>
            </div>
            <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-accent/60 transition-all duration-300"
                style={{ width: `${Math.round((s.count / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Crew scorecard ───────────────────────────────────────────────────────────

function CrewScorecardPanel({ byCrew }) {
  if (!byCrew || byCrew.length === 0) return null;
  return (
    <div className="bg-slate-card border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.06]">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/30">Crew Performance</p>
      </div>
      <div className="px-6 py-2 border-b border-white/[0.04] grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4">
        {['Crew', 'Open', 'Done', 'Rescheduled', 'On Time', 'Rate'].map(h => (
          <span key={h} className="text-[10px] text-white/25 font-semibold uppercase tracking-widest text-right first:text-left">{h}</span>
        ))}
      </div>
      <div className="divide-y divide-white/[0.04]">
        {byCrew.map(c => {
          const rateColor = c.completed > 0
            ? c.onTimeRate >= 80 ? 'text-success' : c.onTimeRate >= 60 ? 'text-warning' : 'text-danger'
            : 'text-white/25';
          return (
            <div key={c.name} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 items-center px-6 py-3 hover:bg-white/[0.03]">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                <span className="text-sm font-medium text-white/80 truncate">{c.name}</span>
              </div>
              <span className="text-sm font-semibold tabular-nums text-white text-right">{c.open}</span>
              <span className="text-sm tabular-nums text-white/60 text-right">{c.completed}</span>
              <span className="text-sm tabular-nums text-right">
                {c.rescheduled > 0
                  ? <span className="text-warning font-medium">{c.rescheduled}</span>
                  : <span className="text-white/25">—</span>}
              </span>
              <span className="text-sm tabular-nums text-white/60 text-right">{c.onTime}</span>
              <span className={`text-sm font-bold tabular-nums text-right ${rateColor}`}>
                {c.completed > 0 ? `${c.onTimeRate}%` : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InstallationOverview({ data }) {
  const [activePeriod, setActivePeriod] = useState('thisWeek');
  const [activeCard,   setActiveCard]   = useState(null);
  const [activeAlert,  setActiveAlert]  = useState(null);

  const today = new Date().toISOString().slice(0, 10);

  const schedule       = data.schedule?.[activePeriod] ?? {};
  const scheduledTotal = schedule.scheduled ?? 0;
  const onTimeTotal    = schedule.onTime    ?? 0;
  const atRiskTotal    = schedule.late      ?? 0;

  // 3-week calendar: this week, next week, in 2 weeks
  const calendarWeeks = useMemo(() =>
    CALENDAR_WEEK_LABELS.map((label, i) => {
      const d = new Date(today + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + i * 7);
      return { label, days: getWeekDays(d.toISOString().slice(0, 10)) };
    }),
  [today]);

  // crew name → color lookup for day column summaries
  const crewColorMap = useMemo(() => {
    const map = {};
    for (const crew of (data.byCrew ?? [])) map[crew.name] = crew.color;
    return map;
  }, [data.byCrew]);

  // group jobs by installDate for the calendar
  const calendarJobsByDay = useMemo(() => {
    const map = {};
    for (const week of calendarWeeks)
      for (const day of week.days) map[day.date] = [];
    for (const job of data.jobs)
      if (job.installDate && map[job.installDate] !== undefined)
        map[job.installDate].push(job);
    return map;
  }, [data.jobs, calendarWeeks]);

  const lateJobs = useMemo(() =>
    data.jobs.filter(j => j.status === 'late'),
  [data.jobs]);

  const pendingJobs = useMemo(() =>
    data.jobs.filter(j => j.status === 'pending'),
  [data.jobs]);

  const alertPanelJobs = useMemo(() => {
    if (activeAlert === 'late')    return lateJobs;
    if (activeAlert === 'pending') return pendingJobs;
    return [];
  }, [activeAlert, lateJobs, pendingJobs]);

  const panelJobs = useMemo(() => {
    if (!activeCard || !schedule.jobs) return [];
    if (activeCard === 'scheduled') return schedule.jobs;
    if (activeCard === 'onTime')    return schedule.jobs.filter(j => j.state === 'on_time' || j.state === 'early');
    if (activeCard === 'atRisk')    return schedule.jobs.filter(j => j.state === 'late' || j.state === 'overdue');
    return [];
  }, [activeCard, schedule.jobs]);

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

      {/* ── Intake health ── */}
      <IntakeCard unreviewed={data.summary?.unreviewed} />

      {/* ── Alert cards ── */}
      <div className="grid grid-cols-2 gap-4">
        <AlertCard
          label="Late / Overdue"
          value={lateJobs.length}
          sub="open jobs past their install date"
          active={activeAlert === 'late'}
          onClick={() => toggleAlert('late')}
        />
        <AlertCard
          label="Pending / No Date"
          value={pendingJobs.length}
          sub="jobs without an install date set"
          active={activeAlert === 'pending'}
          onClick={() => toggleAlert('pending')}
        />
      </div>

      {/* ── Alert panel ── */}
      {activeAlert && <JobPanel jobs={alertPanelJobs} accentColor="danger" />}

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
        <KpiCard label="Jobs Scheduled" value={scheduledTotal} sub="total installs in period"
          active={activeCard === 'scheduled'} onClick={() => toggleCard('scheduled')} />
        <KpiCard label="On Time" value={onTimeTotal} sub="completed on schedule" color="success"
          active={activeCard === 'onTime'} onClick={() => toggleCard('onTime')} />
        <KpiCard label="At Risk / Late" value={atRiskTotal} sub="overdue or past install date"
          color={atRiskTotal > 0 ? 'danger' : undefined}
          active={activeCard === 'atRisk'} onClick={() => toggleCard('atRisk')} />
      </div>

      {/* ── KPI panel ── */}
      {activeCard && <JobPanel jobs={panelJobs} />}

      {/* ── Legend ── */}
      <div className="flex items-center gap-4">
        {[
          { label: 'On Time',     cls: 'bg-success'     },
          { label: 'Scheduled',   cls: 'bg-accent'      },
          { label: 'Rescheduled', cls: 'bg-warning'     },
          { label: 'Late',        cls: 'bg-danger'      },
        ].map(({ label, cls }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${cls}`} />
            <span className="text-[11px] text-white/40">{label}</span>
          </div>
        ))}
      </div>

      {/* ── 3-week Mon–Fri calendar ── */}
      {calendarWeeks.map((week, wi) => (
        <div key={wi} className="space-y-3">
          <div className="flex items-center gap-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 shrink-0">{week.label}</p>
            <div className="flex-1 h-px bg-white/[0.06]" />
            <p className="text-[10px] text-white/20 shrink-0">
              {week.days[0].dayNum} {week.days[0].month} – {week.days[4].dayNum} {week.days[4].month}
            </p>
          </div>
          <div className="grid grid-cols-5 gap-3 items-start">
            {week.days.map(day => (
              <DayColumn
                key={day.date}
                day={day}
                jobs={calendarJobsByDay[day.date] ?? []}
                isToday={day.date === today}
                crewColorMap={crewColorMap}
              />
            ))}
          </div>
        </div>
      ))}

      {/* ── Section pipeline + Crew scorecard ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionPipelinePanel bySection={data.bySection} />
        <CrewScorecardPanel byCrew={data.byCrew} />
      </div>

      {/* ── Jobs table ── */}
      <JobsTable jobs={data.jobs} />
    </div>
  );
}
