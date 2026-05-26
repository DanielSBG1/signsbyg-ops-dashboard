import React, { useState, useMemo } from 'react';
import JobsTable from './JobsTable';

const PERIODS = [
  { id: 'thisWeek',    label: 'This Week'     },
  { id: 'lastWeek',    label: 'Last Week'     },
  { id: 'monthToDate', label: 'Month to Date' },
];

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

// ─── Job panel ────────────────────────────────────────────────────────────────

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
          const badge = STATUS_BADGE[status] ?? STATUS_BADGE.pending;
          const crews = Array.isArray(job.crews) ? job.crews.join(', ') : (job.crews ?? null);
          const meta = [crews, job.section].filter(Boolean).join(' · ');
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

// ─── Crew week card ───────────────────────────────────────────────────────────────

function CrewWeekCard({ crew }) {
  const [expanded, setExpanded] = useState(true);
  const { name, color, jobs } = crew;
  if (!jobs || jobs.length === 0) return null;
  const done = jobs.filter(j => j.state === 'on_time').length;
  const late = jobs.filter(j => j.state === 'late' || j.state === 'overdue').length;

  return (
    <div className="bg-slate-card border border-white/10 rounded-2xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.03] transition-colors text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-sm font-semibold text-white/90 flex-1">{name}</span>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-white/40">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</span>
          {done > 0 && <span className="text-[10px] font-semibold text-success">{done} done</span>}
          {late > 0 && <span className="text-[10px] font-semibold text-danger">{late} late</span>}
        </div>
        <span className="text-white/25 text-xs ml-1">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="divide-y divide-white/[0.04] border-t border-white/[0.06]">
          {jobs.map(job => {
            const badge = STATUS_BADGE[job.state] ?? STATUS_BADGE.in_progress;
            return (
              <a
                key={job.id}
                href={job.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors"
              >
                <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${badge.cls}`}>
                  {badge.label}
                </span>
                <span className="flex-1 text-sm text-white/80 truncate">{job.name}</span>
                <span className="shrink-0 text-xs text-white/35 tabular-nums">{formatDate(job.installDate)}</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Section pipeline ───────────────────────────────────────────────────────────────

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

// ─── Crew scorecard ─────────────────────────────────────────────────────────────────

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

  const schedule       = data.schedule?.[activePeriod] ?? {};
  const scheduledTotal = schedule.scheduled ?? 0;
  const onTimeTotal    = schedule.onTime    ?? 0;
  const atRiskTotal    = schedule.late      ?? 0;

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

  const thisWeekCrews = data.schedule?.thisWeek?.crews ?? [];

  return (
    <div className="space-y-5">

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

      {/* ── This week by crew ── */}
      {thisWeekCrews.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/40 shrink-0">This Week by Crew</p>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>
          <div className="space-y-3">
            {thisWeekCrews.map(crew => (
              <CrewWeekCard key={crew.name} crew={crew} />
            ))}
          </div>
        </div>
      )}

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
