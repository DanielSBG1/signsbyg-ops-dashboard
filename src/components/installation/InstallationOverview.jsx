import React, { useState, useMemo } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const PERIODS = [
  { id: 'thisWeek',    label: 'This Week'     },
  { id: 'lastWeek',    label: 'Last Week'     },
  { id: 'monthToDate', label: 'Month to Date' },
];

const STATUS_BADGE = {
  early:       { label: 'Early',       cls: 'bg-success/20 text-success' },
  on_time:     { label: 'On Time',     cls: 'bg-success/20 text-success' },
  bled_over:   { label: 'Bled Over',   cls: 'bg-warning/20 text-warning' },
  scheduled:   { label: 'Scheduled',   cls: 'bg-accent/20 text-accent' },
  in_progress: { label: 'Upcoming',    cls: 'bg-accent/20 text-accent' },
  pending:     { label: 'No Date',     cls: 'bg-black/[0.05] text-gray-500' },
  late:        { label: 'Late',        cls: 'bg-danger/20 text-danger' },
  overdue:     { label: 'Overdue',     cls: 'bg-danger/20 text-danger' },
  rescheduled: { label: 'Rescheduled', cls: 'bg-warning/20 text-warning' },
  failed:      { label: 'Failed',      cls: 'bg-danger/20 text-danger' },
};

const STATUS_CARD = {
  early:       { borderClass: 'border-success/30',   dotClass: 'bg-success'  },
  on_time:     { borderClass: 'border-success/30',   dotClass: 'bg-success'  },
  bled_over:   { borderClass: 'border-warning/30',   dotClass: 'bg-warning'  },
  scheduled:   { borderClass: 'border-gray-200',     dotClass: 'bg-accent'   },
  pending:     { borderClass: 'border-gray-200',     dotClass: 'bg-gray-300' },
  late:        { borderClass: 'border-danger/40',    dotClass: 'bg-danger'   },
  rescheduled: { borderClass: 'border-warning/30',   dotClass: 'bg-warning'  },
  failed:      { borderClass: 'border-danger/40',    dotClass: 'bg-danger'   },
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
  if (!dateStr) return '\u2014';
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

// ─── Alert card (grid-cols-3 top section) ─────────────────────────────────────

function AlertCard({ label, value, sub, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white border rounded-2xl p-6 transition-all duration-150 ${
        active
          ? 'border-danger/50 ring-1 ring-danger/20'
          : value > 0
            ? 'border-danger/25 hover:border-danger/45'
            : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <p className="text-gray-500 text-[11px] font-semibold uppercase tracking-widest mb-3">{label}</p>
      <p className={`text-6xl font-black tabular-nums leading-none ${value > 0 ? 'text-danger' : 'text-gray-500'}`}>
        {value ?? 0}
      </p>
      {sub && <p className="text-gray-500 text-xs mt-2">{sub}</p>}
      <p className={`text-[10px] mt-3 transition-colors ${active ? 'text-danger' : 'text-gray-500'}`}>
        {active ? 'Click to collapse \u2191' : 'Click to see jobs \u2193'}
      </p>
    </button>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, active, onClick }) {
  const cls = { success: 'text-success', danger: 'text-danger', warning: 'text-warning' }[color] ?? 'text-gray-900';
  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white border rounded-2xl p-6 transition-all duration-150 ${
        active
          ? 'border-accent/60 ring-1 ring-accent/30 bg-accent/[0.04]'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <p className="text-gray-500 text-[11px] font-semibold uppercase tracking-widest mb-3">{label}</p>
      <p className={`text-5xl font-bold tabular-nums leading-none ${cls}`}>{value ?? '\u2014'}</p>
      {sub && <p className="text-gray-500 text-xs mt-2">{sub}</p>}
      <p className={`text-[10px] mt-3 transition-colors ${active ? 'text-accent' : 'text-gray-500'}`}>
        {active ? 'Click to collapse \u2191' : 'Click to see jobs \u2193'}
      </p>
    </button>
  );
}

// ─── Job panel (expandable list from alert / KPI clicks) ──────────────────────

function JobPanel({ jobs, accentColor }) {
  const borderCls = accentColor === 'danger' ? 'border-danger/30' : 'border-accent/20';
  if (jobs.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-500 text-sm">
        No jobs for this selection.
      </div>
    );
  }
  return (
    <div className={`bg-white border ${borderCls} rounded-2xl overflow-hidden`}>
      <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest">Jobs</p>
        <p className="text-xs text-gray-500">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="divide-y divide-gray-100">
        {jobs.map((job, i) => {
          const status = job.status ?? job.state ?? 'pending';
          const badge  = STATUS_BADGE[status] ?? STATUS_BADGE.pending;
          const crews  = Array.isArray(job.crews) ? job.crews.join(', ') : null;
          const meta   = [crews, job.section].filter(Boolean).join(' \u00B7 ');
          return (
            <a
              key={job.id ?? i}
              href={job.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-black/[0.02] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{job.name}</p>
                {meta && <p className="text-[11px] text-gray-500 mt-0.5">{meta}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-gray-500 tabular-nums">{formatDate(job.installDate)}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>{badge.label}</span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

// ─── Install job card (inside day column) ─────────────────────────────────────

function InstallJobCard({ job }) {
  const cfg   = STATUS_CARD[job.status] ?? STATUS_CARD.scheduled;
  const crews = Array.isArray(job.crews) ? job.crews : [];
  const isDone = job.status === 'on_time' || job.status === 'early';
  return (
    <a
      href={job.url}
      target="_blank"
      rel="noreferrer"
      className={`block rounded-xl border ${cfg.borderClass} bg-black/[0.02] hover:bg-black/[0.04] transition-all duration-150 p-3 space-y-2 group`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-[3px] w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} />
        <span className={`text-sm font-medium leading-snug group-hover:text-gray-800 truncate ${isDone ? 'text-gray-500 line-through decoration-gray-300' : 'text-gray-900'}`}>
          {job.name}
        </span>
      </div>
      {crews.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pl-4">
          {crews.map(crew => (
            <span key={crew} className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-black/[0.05] text-gray-500">
              {crew}
            </span>
          ))}
        </div>
      )}
      {(job.status === 'late' || job.status === 'rescheduled') && (
        <div className="pl-4">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
            job.status === 'late' ? 'bg-danger/20 text-danger' : 'bg-warning/20 text-warning'
          }`}>
            {STATUS_BADGE[job.status]?.label}
          </span>
        </div>
      )}
    </a>
  );
}

// ─── Day column ───────────────────────────────────────────────────────────────

function DayColumn({ day, jobs, isToday, crewColorMap }) {
  const uniqueCrews = useMemo(() => {
    const set = new Set();
    for (const job of jobs) {
      for (const c of (job.crews ?? [])) set.add(c);
    }
    return set.size;
  }, [jobs]);

  const lateCount = jobs.filter(j => j.status === 'late' || j.status === 'failed').length;

  return (
    <div className={`rounded-2xl border flex flex-col gap-0 overflow-hidden ${
      isToday ? 'border-accent/50 bg-accent/[0.04]' : 'border-gray-200 bg-white'
    }`}>
      {/* Day header */}
      <div className={`px-4 pt-4 pb-3 ${isToday ? 'border-b border-accent/20' : 'border-b border-gray-200'}`}>
        <div className="flex items-center justify-between mb-1">
          <span className={`text-[11px] font-bold uppercase tracking-widest ${isToday ? 'text-accent' : 'text-gray-500'}`}>
            {day.label}
          </span>
          {isToday && <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full font-semibold">Today</span>}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={`text-3xl font-bold leading-none ${isToday ? 'text-gray-900' : 'text-gray-600'}`}>{day.dayNum}</span>
          <span className="text-sm text-gray-500">{day.month}</span>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[11px] text-gray-500">{jobs.length} install{jobs.length !== 1 ? 's' : ''}</span>
          {lateCount > 0 && (
            <>
              <span className="text-gray-500">&middot;</span>
              <span className="text-[11px] text-danger font-semibold">{lateCount} late</span>
            </>
          )}
        </div>
      </div>

      {/* Crew count strip */}
      {uniqueCrews > 0 && (
        <div className="px-4 py-2 border-b border-gray-100">
          <span className="text-[10px] text-gray-500 font-medium">{uniqueCrews} crew{uniqueCrews !== 1 ? 's' : ''} active</span>
        </div>
      )}

      {/* Job cards */}
      <div className="flex-1 p-3 space-y-2">
        {jobs.length === 0
          ? <p className="text-gray-500 text-xs text-center py-6">No installs</p>
          : jobs.map((job, i) => <InstallJobCard key={job.id ?? i} job={job} />)
        }
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

  // ── Data reads ──
  const lateCount        = data.summary?.late ?? 0;
  const unreviewedCount  = data.summary?.unreviewed?.count ?? 0;
  const pendingCount     = data.summary?.pending ?? 0;

  const schedule       = data.schedule?.[activePeriod] ?? {};
  const scheduledTotal = schedule.scheduled ?? 0;
  const onTimeTotal    = schedule.onTime    ?? 0;
  const atRiskTotal    = schedule.late      ?? 0;

  // ── Week days for calendar ──
  const weekDays = useMemo(() => getWeekDays(today), [today]);

  // ── Crew color lookup ──
  const crewColorMap = useMemo(() => {
    const map = {};
    for (const crew of (data.byCrew ?? [])) map[crew.name] = crew.color;
    return map;
  }, [data.byCrew]);

  // ── Jobs grouped by installDate for the weekly calendar ──
  const jobsByDay = useMemo(() => {
    const map = {};
    for (const day of weekDays) map[day.date] = [];
    for (const job of (data.jobs ?? [])) {
      if (job.installDate && map[job.installDate] !== undefined) {
        map[job.installDate].push(job);
      }
    }
    return map;
  }, [data.jobs, weekDays]);

  // ── Filtered job lists for alert panels ──
  const lateJobs = useMemo(() =>
    (data.jobs ?? []).filter(j => j.status === 'late'),
  [data.jobs]);

  const unreviewedJobs = useMemo(() => {
    if (!data.summary?.unreviewed?.jobs) {
      return (data.jobs ?? []).filter(j => j.status === 'unreviewed' || j.reviewed === false);
    }
    return data.summary.unreviewed.jobs;
  }, [data.summary, data.jobs]);

  const pendingJobs = useMemo(() =>
    (data.jobs ?? []).filter(j => j.status === 'pending'),
  [data.jobs]);

  const alertPanelJobs = useMemo(() => {
    if (activeAlert === 'late')       return lateJobs;
    if (activeAlert === 'unreviewed') return unreviewedJobs;
    if (activeAlert === 'pending')    return pendingJobs;
    return [];
  }, [activeAlert, lateJobs, unreviewedJobs, pendingJobs]);

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

      {/* ── Top: 3 Alert modules (grid-cols-3) ── */}
      <div className="grid grid-cols-3 gap-4">
        <AlertCard
          label="Late Open Orders"
          value={lateCount}
          sub="past install date \u2014 should be zero"
          active={activeAlert === 'late'}
          onClick={() => toggleAlert('late')}
        />
        <AlertCard
          label="Unreviewed"
          value={unreviewedCount}
          sub="jobs not yet triaged from intake"
          active={activeAlert === 'unreviewed'}
          onClick={() => toggleAlert('unreviewed')}
        />
        <AlertCard
          label="Pending Date"
          value={pendingCount}
          sub="reviewed but no install date set"
          active={activeAlert === 'pending'}
          onClick={() => toggleAlert('pending')}
        />
      </div>

      {/* ── Alert expansion panel ── */}
      {activeAlert && <JobPanel jobs={alertPanelJobs} accentColor="danger" />}

      {/* ── Middle: Period selector ── */}
      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => { setActivePeriod(p.id); setActiveCard(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activePeriod === p.id
                ? 'bg-accent text-white'
                : 'bg-black/[0.03] text-gray-500 hover:text-gray-700 hover:bg-black/[0.05]'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Middle: 3 KPI cards ── */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          label="Jobs Scheduled"
          value={scheduledTotal}
          sub="total installs in period"
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
          sub="overdue or past install date"
          color={atRiskTotal > 0 ? 'danger' : undefined}
          active={activeCard === 'atRisk'}
          onClick={() => toggleCard('atRisk')}
        />
      </div>

      {/* ── KPI expansion panel ── */}
      {activeCard && <JobPanel jobs={panelJobs} />}

      {/* ── Legend ── */}
      <div className="flex items-center gap-4">
        {[
          { label: 'On Time',     cls: 'bg-success'  },
          { label: 'Scheduled',   cls: 'bg-accent'   },
          { label: 'Rescheduled', cls: 'bg-warning'  },
          { label: 'Late',        cls: 'bg-danger'   },
        ].map(({ label, cls }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${cls}`} />
            <span className="text-[11px] text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Bottom: Mon-Fri day columns (This Week) ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 shrink-0">This Week</p>
          <div className="flex-1 h-px bg-gray-200" />
          <p className="text-[10px] text-gray-500 shrink-0">
            {weekDays[0]?.dayNum} {weekDays[0]?.month} &ndash; {weekDays[4]?.dayNum} {weekDays[4]?.month}
          </p>
        </div>
        <div className="grid grid-cols-5 gap-3 items-start">
          {weekDays.map(day => (
            <DayColumn
              key={day.date}
              day={day}
              jobs={jobsByDay[day.date] ?? []}
              isToday={day.date === today}
              crewColorMap={crewColorMap}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
