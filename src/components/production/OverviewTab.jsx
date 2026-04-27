import React, { useState, useMemo } from 'react';
import JobDrawer from './JobDrawer';
import { computeProductionHealth, sortByHealth, BAND_CONFIG } from '../../utils/health.js';

// ─── Health bar gradient (matches PM dashboard) ───────────────

function healthBarColor(score) {
  const t = Math.max(0, Math.min(100, score)) / 100;
  let r, g;
  if (t <= 0.5) {
    r = 239; g = Math.round(68 + (234 - 68) * (t / 0.5));
  } else {
    r = Math.round(234 + (34 - 234) * ((t - 0.5) / 0.5));
    g = Math.round(234 + (197 - 234) * ((t - 0.5) / 0.5));
  }
  return `rgb(${r},${g},68)`;
}

// ─── Color constants ──────────────────────────────────────────

const HEALTH_COLORS = {
  critical: '#ef4444',
  at_risk:  '#f97316',
  watch:    '#facc15',
  healthy:  '#22c55e',
  no_data:  '#6b7280',
};

const HEALTH_LABELS = {
  critical: 'Critical',
  at_risk:  'At Risk',
  watch:    'Watch',
  healthy:  'Healthy',
  no_data:  'No Data',
};

const STAGE_COLORS = {
  'pre press':          '#a855f7',
  'purchasing':         '#3b82f6',
  'cnc routing':        '#f97316',
  'vinyl':              '#06b6d4',
  'channel letter fab': '#eab308',
  'paint':              '#ec4899',
  'fabrication':        '#6366f1',
  'assembly':           '#22c55e',
  'qc':                 '#ef4444',
};

// Production flow order — segments render in this sequence, not by count
const PIPELINE_FLOW = [
  'purchasing',
  'pre press',
  'vinyl',
  'cnc routing',
  'channel letter fab',
  'fabrication',
  'paint',
  'assembly',
  'qc',
];

// Display labels for canonical stage keys
const STAGE_DISPLAY = {
  'purchasing':         'Purchasing',
  'pre press':          'Pre Press',
  'vinyl':              'Graphics/Vinyl',
  'channel letter fab': 'Channel Letters',
  'fabrication':        'Fabrication',
  'assembly':           'Assembly',
  'qc':                 'QC',
  'cnc routing':        'CNC Routing',
  'paint':              'Paint',
};

// Normalize Asana sub-task name (e.g. "PURCHASING - Job Name") to a canonical key.
// Names are inconsistent: vary in case, have typos, may or may not include " - Job Name".
function normalizeStageKey(taskName) {
  const u = taskName.toUpperCase().trim();
  if (u.startsWith('PURCHASING') || u.startsWith('BUY MATERIAL')) return 'purchasing';
  if (u.startsWith('PREPRESS') || u.startsWith('PRE PRESS') || u.startsWith('PRE-PRESS') || u.startsWith('PREPRVESS')) return 'pre press';
  if (u.startsWith('GRAPHICS') || u.startsWith('GRPAHICS') || u.startsWith('VINYL')) return 'vinyl';
  if (u.startsWith('CHANNEL LETTER')) return 'channel letter fab';
  if (u.startsWith('FABRICAT')) return 'fabrication'; // covers FABRICATION + FABRICATON typo
  if (u.startsWith('ASSEMBLY')) return 'assembly';
  if (u.startsWith('QC')) return 'qc';
  if (u.startsWith('ROUTING') || u.startsWith('ROUTER') || u.startsWith('CNC') || u.startsWith('MACHINING') || u.startsWith('PREBEND')) return 'cnc routing';
  if (u.startsWith('PAINT') || u.startsWith('TOUCH-UP PAINT')) return 'paint';
  return null;
}

// ─── Data helpers ─────────────────────────────────────────────

// Returns segments sorted critical→at_risk→watch→healthy→no_data
// Each: { band, label, colorHex, count, jobs }
function buildHealthSegments(scoredJobs) {
  const map = {};
  for (const job of scoredJobs) {
    const { band } = job._health;
    if (!map[band]) {
      map[band] = {
        band,
        label:    HEALTH_LABELS[band],
        colorHex: HEALTH_COLORS[band],
        count:    0,
        jobs:     [],
      };
    }
    map[band].count++;
    map[band].jobs.push(job);
  }
  return ['critical', 'at_risk', 'watch', 'healthy', 'no_data']
    .map(b => map[b])
    .filter(Boolean);
}

// Returns segments in PIPELINE_FLOW order (only departments with tasks)
// Each: { name (lowercase key), label (display), colorHex, count, taskRows }
// taskRows: [{ job, stageDueOn }] — job has _health attached (scored)
function buildStageSegments(scoredJobs) {
  const map = {};
  for (const job of scoredJobs) {
    for (const sub of job.subTasks) {
      if (sub.completed) continue;
      if (sub.name.toLowerCase().startsWith('re do -')) continue;
      const key = normalizeStageKey(sub.name) ?? sub.name.toLowerCase();
      if (!map[key]) {
        map[key] = {
          name:     key,
          label:    STAGE_DISPLAY[key] ?? sub.name.split(' - ')[0].trim(),
          colorHex: STAGE_COLORS[key] ?? '#6b7280',
          count:    0,
          taskRows: [],
        };
      }
      map[key].count++;
      map[key].taskRows.push({ job, stageDueOn: sub.due_on });
    }
  }
  // Sort by PIPELINE_FLOW order; stages not in the list go to end
  return Object.values(map).sort((a, b) => {
    const ai = PIPELINE_FLOW.indexOf(a.name);
    const bi = PIPELINE_FLOW.indexOf(b.name);
    const aIdx = ai === -1 ? 999 : ai;
    const bIdx = bi === -1 ? 999 : bi;
    return aIdx - bIdx;
  });
}

// ─── Shared utilities ─────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return dateStr; }
}

// ─── HealthJobsModal ──────────────────────────────────────────

function HealthJobsModal({ segment, today, onClose, onJobClick }) {
  const [sortCol, setSortCol] = useState('score');
  const [sortDir, setSortDir] = useState('asc');

  React.useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleCol(key) {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(key); setSortDir('asc'); }
  }

  const rows = useMemo(() => {
    return [...segment.jobs].sort((a, b) => {
      let av, bv;
      if (sortCol === 'name')   { av = (a.name ?? '').toLowerCase(); bv = (b.name ?? '').toLowerCase(); }
      if (sortCol === 'score')  { av = a._health.score ?? -1;        bv = b._health.score ?? -1; }
      if (sortCol === 'due_on') { av = a.due_on ?? '9999-99-99';     bv = b.due_on ?? '9999-99-99'; }
      return (av < bv ? -1 : av > bv ? 1 : 0) * (sortDir === 'asc' ? 1 : -1);
    });
  }, [segment.jobs, sortCol, sortDir]);

  const COLS = [
    { key: 'name',   label: 'Job Name' },
    { key: 'score',  label: 'Health Score' },
    { key: 'due_on', label: 'Due Date' },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1e30] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0"
          style={{ backgroundColor: `${segment.colorHex}22` }}
        >
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: segment.colorHex }} />
            <span className="text-lg font-bold text-white">
              {segment.label} — {segment.count} job{segment.count !== 1 ? 's' : ''}
            </span>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-white/30 hover:text-white/80 text-2xl leading-none">×</button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_80px_130px_110px] gap-4 px-6 py-3 border-b border-white/5 bg-white/[0.02] flex-shrink-0">
          {COLS.map(col => (
            <button
              key={col.key}
              onClick={() => handleCol(col.key)}
              className={`text-left text-xs uppercase tracking-wider font-semibold flex items-center gap-1 transition-colors ${
                sortCol === col.key ? 'text-yellow-300' : 'text-white/35 hover:text-white/65'
              }`}
            >
              {col.label}
              {sortCol === col.key && <span className="text-[10px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
            </button>
          ))}
          <span className="text-xs uppercase tracking-wider text-white/35">Flags</span>
        </div>

        {/* Rows */}
        <div className="overflow-y-auto flex-1 divide-y divide-white/[0.04]">
          {rows.length === 0 && (
            <p className="px-6 py-8 text-center text-white/30 text-sm">No jobs</p>
          )}
          {rows.map(job => {
            const isPastDue = job.due_on && job.due_on < today;
            return (
              <div
                key={job.gid}
                className="grid grid-cols-[1fr_80px_130px_110px] gap-4 items-center px-6 py-3 hover:bg-white/[0.04] cursor-pointer transition-colors"
                onClick={() => { onJobClick(job); onClose(); }}
              >
                <span className="text-sm text-white/90 truncate" title={job.name}>{job.name}</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: segment.colorHex }}>
                  {job._health.score ?? '—'}
                </span>
                <span className={`text-sm tabular-nums ${isPastDue ? 'text-red-400 font-semibold' : 'text-white/50'}`}>
                  {job.due_on ? formatDate(job.due_on) : '—'}
                  {isPastDue && <span className="ml-1 text-xs">(late)</span>}
                </span>
                <div className="flex gap-1 flex-wrap">
                  {job.redoType && (
                    <span className="text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded-full">REDO</span>
                  )}
                  {job.status === 'late' && (
                    <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded-full">LATE</span>
                  )}
                  {job.projectedLate && (
                    <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full">⚠ PROJ. LATE</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── StageJobsModal ───────────────────────────────────────────

function StageJobsModal({ segment, today, onClose, onJobClick }) {
  const [sortCol, setSortCol] = useState('stageDueOn');
  const [sortDir, setSortDir] = useState('asc');

  React.useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleCol(key) {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(key); setSortDir('asc'); }
  }

  const rows = useMemo(() => {
    return [...segment.taskRows].sort((a, b) => {
      let av, bv;
      if (sortCol === 'name')       { av = (a.job.name ?? '').toLowerCase();  bv = (b.job.name ?? '').toLowerCase(); }
      if (sortCol === 'stageDueOn') { av = a.stageDueOn ?? '9999-99-99';      bv = b.stageDueOn ?? '9999-99-99'; }
      if (sortCol === 'health')     { av = a.job._health?.score ?? -1;        bv = b.job._health?.score ?? -1; }
      return (av < bv ? -1 : av > bv ? 1 : 0) * (sortDir === 'asc' ? 1 : -1);
    });
  }, [segment.taskRows, sortCol, sortDir]);

  const COLS = [
    { key: 'name',       label: 'Job Name' },
    { key: 'stageDueOn', label: 'Stage Due' },
    { key: 'health',     label: 'Health' },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1e30] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0"
          style={{ backgroundColor: `${segment.colorHex}22` }}
        >
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: segment.colorHex }} />
            <span className="text-lg font-bold text-white capitalize">
              {segment.label} — {segment.count} open task{segment.count !== 1 ? 's' : ''}
            </span>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-white/30 hover:text-white/80 text-2xl leading-none">×</button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_110px_65px_120px_80px] gap-3 px-6 py-3 border-b border-white/5 bg-white/[0.02] flex-shrink-0">
          {COLS.map(col => (
            <button
              key={col.key}
              onClick={() => handleCol(col.key)}
              className={`text-left text-xs uppercase tracking-wider font-semibold flex items-center gap-1 transition-colors ${
                sortCol === col.key ? 'text-yellow-300' : 'text-white/35 hover:text-white/65'
              }`}
            >
              {col.label}
              {sortCol === col.key && <span className="text-[10px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
            </button>
          ))}
          <span className="text-xs uppercase tracking-wider text-white/35">Flags</span>
          <span className="text-xs uppercase tracking-wider text-white/35">Status</span>
        </div>

        {/* Rows */}
        <div className="overflow-y-auto flex-1 divide-y divide-white/[0.04]">
          {rows.length === 0 && (
            <p className="px-6 py-8 text-center text-white/30 text-sm">No open tasks</p>
          )}
          {rows.map((row, i) => {
            const isOverdue   = row.stageDueOn && row.stageDueOn < today;
            const healthScore = row.job._health?.score ?? null;
            const healthColor = healthScore !== null ? healthBarColor(healthScore) : '#6b7280';
            return (
              <div
                key={`${row.job.gid}-${row.stageDueOn ?? 'nodate'}-${i}`}
                className="grid grid-cols-[1fr_110px_65px_120px_80px] gap-3 items-center px-6 py-3 hover:bg-white/[0.04] cursor-pointer transition-colors"
                onClick={() => { onJobClick(row.job); onClose(); }}
              >
                <span className="text-sm text-white/90 truncate" title={row.job.name}>{row.job.name}</span>
                <span className={`text-sm tabular-nums ${isOverdue ? 'text-red-400 font-semibold' : 'text-white/50'}`}>
                  {row.stageDueOn ? formatDate(row.stageDueOn) : '—'}
                  {isOverdue && <span className="ml-1 text-xs">(late)</span>}
                </span>
                <span className="text-sm font-bold tabular-nums" style={{ color: healthColor }}>
                  {healthScore ?? '—'}
                </span>
                <div className="flex gap-1 flex-wrap">
                  {row.job.redoType && (
                    <span className="text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded-full">REDO</span>
                  )}
                  {row.job.status === 'late' && (
                    <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded-full">LATE</span>
                  )}
                </div>
                <span className={`text-xs ${isOverdue ? 'text-red-400' : 'text-white/20'}`}>
                  {isOverdue ? 'Overdue' : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── SegmentedBar (shared) ────────────────────────────────────

function SegmentedBar({ segments, total, onSegmentClick }) {
  return (
    <div className="flex h-7 gap-px">
      {segments.map((seg, i) => {
        const isFirst = i === 0;
        const isLast  = i === segments.length - 1;
        return (
          <div
            key={seg.name ?? seg.band}
            className="group relative"
            style={{ width: `${(seg.count / total) * 100}%` }}
          >
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-[#1e1e30] border border-white/10 rounded-md shadow-xl text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              <span className="font-bold text-white">{seg.label}</span>
              <span className="text-white/40 ml-1.5">{seg.count}</span>
            </div>
            <button
              className={`w-full h-full hover:brightness-125 transition-all focus:outline-none ${isFirst ? 'rounded-l-lg' : ''} ${isLast ? 'rounded-r-lg' : ''}`}
              style={{ backgroundColor: seg.colorHex }}
              onClick={() => onSegmentClick(seg)}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── PipelineSection ──────────────────────────────────────────

function PipelineSection({ scoredJobs, today, onJobClick }) {
  const [activeHealth, setActiveHealth] = useState(null);
  const [activeStage,  setActiveStage]  = useState(null);

  const healthSegments = useMemo(() => buildHealthSegments(scoredJobs), [scoredJobs]);
  const stageSegments  = useMemo(() => buildStageSegments(scoredJobs), [scoredJobs]);
  const totalJobs  = scoredJobs.length;
  const totalTasks = stageSegments.reduce((s, seg) => s + seg.count, 0);

  if (totalJobs === 0) {
    return (
      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">
          Overall Production Health
        </h2>
        <p className="text-white/30 text-sm text-center py-4">No active jobs</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 space-y-5">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
          Overall Production Health
        </h2>

        {/* Health distribution bar */}
        <div>
          <div className="flex items-center justify-between text-xs text-white/40 mb-2">
            <span>Job health distribution — click to view jobs</span>
            <span>{totalJobs} jobs</span>
          </div>
          <SegmentedBar segments={healthSegments} total={totalJobs} onSegmentClick={setActiveHealth} />
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5">
            {healthSegments.map(seg => (
              <button
                key={seg.band}
                onClick={() => setActiveHealth(seg)}
                className="flex items-center gap-1.5 text-xs text-white/55 hover:text-white/90 transition-colors"
              >
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.colorHex }} />
                {seg.label}
                <span className="text-white/30">{seg.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Stage activity bar */}
        {totalTasks > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs text-white/40 mb-2">
              <span>Production pipeline — click to view jobs</span>
              <span>{totalTasks} open tasks</span>
            </div>
            <SegmentedBar segments={stageSegments} total={totalTasks} onSegmentClick={setActiveStage} />
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5">
              {stageSegments.map(seg => (
                <button
                  key={seg.name}
                  onClick={() => setActiveStage(seg)}
                  className="flex items-center gap-1.5 text-xs text-white/55 hover:text-white/90 transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.colorHex }} />
                  <span className="capitalize">{seg.label}</span>
                  <span className="text-white/30">{seg.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {activeHealth && (
        <HealthJobsModal
          segment={activeHealth}
          today={today}
          onClose={() => setActiveHealth(null)}
          onJobClick={onJobClick}
        />
      )}
      {activeStage && (
        <StageJobsModal
          segment={activeStage}
          today={today}
          onClose={() => setActiveStage(null)}
          onJobClick={onJobClick}
        />
      )}
    </>
  );
}

// ─── KpiCard ──────────────────────────────────────────────────

function KpiCard({ label, value, color }) {
  return (
    <div className="bg-white/5 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-white/40 text-xs">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${color ?? 'text-white'}`}>{value}</span>
    </div>
  );
}

// ─── Alert panels ─────────────────────────────────────────────

// ─── ScheduleSection ──────────────────────────────────────────

const STATE_CFG = {
  on_time:     { label: 'On Time',        cls: 'bg-green-500/20 border-green-500/30 text-green-400' },
  in_progress: { label: 'In Progress',    cls: 'bg-blue-500/20 border-blue-500/30 text-blue-400' },
  overdue:     { label: 'Overdue',        cls: 'bg-red-500/20 border-red-500/30 text-red-400' },
  late:        { label: 'Delivered Late', cls: 'bg-orange-500/20 border-orange-500/30 text-orange-400' },
};

function ScheduleSection({ schedule, scoredJobs, today, onJobClick }) {
  const [showJobs, setShowJobs] = useState(true);
  const { thisWeek, lastWeek, monthToDate } = schedule;

  const jobMap = useMemo(() => {
    const m = {};
    for (const j of scoredJobs) m[j.gid] = j;
    return m;
  }, [scoredJobs]);

  const cols = [
    { label: 'This Week',     data: thisWeek },
    { label: 'Last Week',     data: lastWeek },
    { label: 'Month to Date', data: monthToDate },
  ];

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
        Production Schedule
      </h2>

      {/* Three-column stats */}
      <div className="grid grid-cols-3 gap-3">
        {cols.map(({ label, data }) => (
          <div key={label} className="bg-white/[0.03] border border-white/5 rounded-xl p-3 space-y-2">
            <div className="text-[11px] text-white/40 font-semibold uppercase tracking-wider">{label}</div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-white/50">Scheduled</span>
                <span className="text-xl font-bold text-white tabular-nums">{data.scheduled}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-white/50">On Time</span>
                <span className="text-sm font-bold text-green-400 tabular-nums">{data.onTime}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-white/50">Late</span>
                <span className="text-sm font-bold text-red-400 tabular-nums">{data.late}</span>
              </div>
              {data.inProgress > 0 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-white/50">In Progress</span>
                  <span className="text-sm font-bold text-blue-400 tabular-nums">{data.inProgress}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* This week's job list */}
      {thisWeek.jobs.length > 0 && (
        <div>
          <button
            onClick={() => setShowJobs(v => !v)}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mb-2 w-full text-left"
          >
            <span>{showJobs ? '▾' : '▸'}</span>
            <span className="font-medium">This week's jobs ({thisWeek.jobs.length})</span>
          </button>
          {showJobs && (
            <div className="border border-white/5 rounded-xl overflow-hidden divide-y divide-white/[0.04]">
              {thisWeek.jobs.map(job => {
                const cfg = STATE_CFG[job.state] ?? STATE_CFG.in_progress;
                const fullJob = jobMap[job.gid];
                return (
                  <div
                    key={job.gid}
                    className={`flex items-center gap-3 px-4 py-2.5 ${fullJob ? 'hover:bg-white/[0.04] cursor-pointer' : ''} transition-colors`}
                    onClick={() => fullJob && onJobClick(fullJob)}
                  >
                    <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${cfg.cls}`}>
                      {cfg.label}
                    </span>
                    <span className="flex-1 text-sm text-white/80 truncate">{job.name}</span>
                    <span className="shrink-0 text-xs text-white/30 tabular-nums">{formatDate(job.due_on)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AlertPanel ───────────────────────────────────────────────

function AlertPanel({ title, empty, children }) {
  const hasChildren = React.Children.count(children) > 0;
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-4">
      <h3 className="text-sm font-semibold text-white/70 mb-3">{title}</h3>
      {hasChildren
        ? <div className="space-y-2">{children}</div>
        : <p className="text-white/30 text-xs">{empty}</p>
      }
    </div>
  );
}

function AlertRow({ job, onOpen }) {
  const { score, band } = job._health;
  const cfg = BAND_CONFIG[band];
  return (
    <div
      className="flex items-center gap-2.5 cursor-pointer hover:bg-white/[0.03] rounded-lg px-1 -mx-1 py-1 transition-colors"
      onClick={() => onOpen(job)}
    >
      <span
        className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold border ${cfg.borderClass} ${cfg.badgeBgClass} ${cfg.textClass}`}
      >
        {score ?? '—'}
      </span>
      <span className="flex-1 text-xs text-white/80 truncate">{job.name}</span>
      {job.due_on && (
        <span className={`shrink-0 text-[10px] tabular-nums ${job.status === 'late' ? 'text-danger' : 'text-white/30'}`}>
          {job.due_on}
        </span>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────

export default function OverviewTab({ data }) {
  const [drawerJob, setDrawerJob] = useState(null);
  const today = new Date().toISOString().slice(0, 10);
  const { totals, jobs } = data;

  const scoredJobs = useMemo(
    () => jobs.map(j => ({ ...j, _health: computeProductionHealth(j, today) })),
    [jobs, today]
  );

  const bandCounts = { healthy: 0, watch: 0, at_risk: 0, critical: 0, no_data: 0 };
  scoredJobs.forEach(j => { bandCounts[j._health.band]++; });

  const criticalJobs = scoredJobs.filter(j => j._health.band === 'critical').slice(0, 5);
  const lateJobs     = scoredJobs.filter(j => j.status === 'late').slice(0, 5);
  const redoJobs     = scoredJobs.filter(j => j.redoType);

  return (
    <div className="space-y-6">
      {/* Production schedule */}
      {data.schedule && (
        <ScheduleSection
          schedule={data.schedule}
          scoredJobs={scoredJobs}
          today={today}
          onJobClick={setDrawerJob}
        />
      )}

      {/* Pipeline bars */}
      <PipelineSection
        scoredJobs={scoredJobs}
        today={today}
        onJobClick={setDrawerJob}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Active Jobs"    value={totals.active} />
        <KpiCard label="Healthy"        value={bandCounts.healthy}  color="text-success" />
        <KpiCard label="Watch"          value={bandCounts.watch}    color="text-yellow-400" />
        <KpiCard label="At Risk"        value={bandCounts.at_risk}  color="text-orange-400" />
        <KpiCard label="Critical"       value={bandCounts.critical} color="text-danger" />
        <KpiCard label="Done This Week" value={totals.completedThisWeek} />
      </div>

      {/* Alert panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AlertPanel title="🔴 Critical Jobs" empty="No critical jobs">
          {criticalJobs.map(j => <AlertRow key={j.gid} job={j} onOpen={setDrawerJob} />)}
        </AlertPanel>
        <AlertPanel title="🕐 Late Jobs" empty="No late jobs">
          {lateJobs.map(j => <AlertRow key={j.gid} job={j} onOpen={setDrawerJob} />)}
        </AlertPanel>
        <AlertPanel title="🔄 REDOs in Flight" empty="No REDOs">
          {redoJobs.map(j => <AlertRow key={j.gid} job={j} onOpen={setDrawerJob} />)}
        </AlertPanel>
      </div>

      {drawerJob && (
        <JobDrawer job={drawerJob} onClose={() => setDrawerJob(null)} />
      )}
    </div>
  );
}
