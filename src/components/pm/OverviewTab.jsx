import React, { useState, useMemo } from 'react';
import HealthBadge from './HealthBadge';

// ─── Constants ────────────────────────────────────────────────

const STAGES = [
  { name: 'Design',       key: 'design',       color: '#3b82f6' },
  { name: 'Permitting',   key: 'permitting',   color: '#a855f7' },
  { name: 'Production',   key: 'production',   color: '#f97316' },
  { name: 'Installation', key: 'installation', color: '#eab308' },
  { name: 'Invoicing',    key: 'invoicing',    color: '#22c55e' },
  { name: 'On Hold',      key: null,           color: '#6b7280' },
];

const HEALTH_BANDS = [
  { band: 'healthy',  label: 'On Track',  color: '#22c55e' },
  { band: 'watch',    label: 'Watch',     color: '#eab308' },
  { band: 'risk',     label: 'At Risk',   color: '#f97316' },
  { band: 'critical', label: 'Critical',  color: '#ef4444' },
];

const TODAY = new Date().toISOString().slice(0, 10);

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

function matchStage(section) {
  const lower = (section ?? '').toLowerCase();
  return STAGES.find(s => s.name && lower.includes(s.name.toLowerCase())) ?? null;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

// ─── Department tasks modal ────────────────────────────────────

const DEPT_SORT_COLS = [
  { key: 'name',     label: 'Job Name' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'due_on',   label: 'Due Date' },
  { key: 'status',   label: 'Status' },
];

function sortDeptTasks(tasks, col, dir) {
  return [...tasks].sort((a, b) => {
    let av, bv;
    if (col === 'name')     { av = (a.name ?? '').toLowerCase();   bv = (b.name ?? '').toLowerCase(); }
    if (col === 'assignee') { av = (a.assignee ?? '').toLowerCase(); bv = (b.assignee ?? '').toLowerCase(); }
    if (col === 'due_on')   { av = a.due_on ?? '9999-99-99';        bv = b.due_on ?? '9999-99-99'; }
    if (col === 'status')   { av = a.isRedo ? 0 : (a.due_on && a.due_on < TODAY ? 1 : 2); bv = b.isRedo ? 0 : (b.due_on && b.due_on < TODAY ? 1 : 2); }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ?  1 : -1;
    return 0;
  });
}

function DeptTasksModal({ stage, tasks, onClose }) {
  const [sortCol, setSortCol] = useState('due_on');
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

  const rows = sortDeptTasks(tasks, sortCol, sortDir);

  return (
    <div
      className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1e30] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0"
          style={{ backgroundColor: `${stage.color}20` }}>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: stage.color }} />
            <span className="text-lg font-bold text-white">{stage.name}</span>
            <span className="text-sm text-white/40">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/80 text-2xl leading-none">×</button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_120px_120px_90px] gap-4 px-6 py-3 border-b border-white/5 bg-white/[0.02] flex-shrink-0">
          {DEPT_SORT_COLS.map(col => (
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
        </div>

        {/* Rows */}
        <div className="overflow-y-auto flex-1 divide-y divide-white/[0.04]">
          {rows.map(task => {
            const isOverdue = task.due_on && task.due_on < TODAY;
            return (
              <div
                key={task.gid}
                className="grid grid-cols-[1fr_120px_120px_90px] gap-4 items-center px-6 py-3 hover:bg-white/[0.03]"
              >
                <span className="text-sm text-white/85 truncate" title={task.name}>{task.name}</span>
                <span className="text-sm text-white/50 truncate">{task.assignee ?? '—'}</span>
                <span className={`text-sm tabular-nums ${isOverdue ? 'text-red-400 font-semibold' : 'text-white/50'}`}>
                  {formatDate(task.due_on)}
                  {isOverdue && <span className="ml-1 text-xs">(late)</span>}
                </span>
                <span>
                  {task.isRedo
                    ? <span className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full">REDO</span>
                    : isOverdue
                      ? <span className="text-xs text-red-400/70">Overdue</span>
                      : <span className="text-xs text-white/20">—</span>
                  }
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Cumulative progress section ──────────────────────────────

function HealthJobsModal({ segment, onClose, onJobClick }) {
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
      if (sortCol === 'score')  { av = a.score;  bv = b.score; }
      if (sortCol === 'due_on') { av = a.due_on ?? '9999-99-99'; bv = b.due_on ?? '9999-99-99'; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });
  }, [segment.jobs, sortCol, sortDir]);

  const COLS = [
    { key: 'name',   label: 'Job Name' },
    { key: 'score',  label: 'Health' },
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
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0"
          style={{ backgroundColor: `${segment.color}22` }}>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: segment.color }} />
            <span className="text-lg font-bold text-white">{segment.label}</span>
            <span className="text-sm text-white/40">{segment.count} job{segment.count !== 1 ? 's' : ''}</span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/80 text-2xl leading-none">×</button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_80px_120px_80px] gap-4 px-6 py-3 border-b border-white/5 bg-white/[0.02] flex-shrink-0">
          {COLS.map(col => (
            <button key={col.key} onClick={() => handleCol(col.key)}
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
          {rows.map(job => {
            const isPastDue = job.due_on && job.due_on < TODAY;
            return (
              <div
                key={job.gid}
                className="grid grid-cols-[1fr_80px_120px_80px] gap-4 items-center px-6 py-3 hover:bg-white/[0.04] cursor-pointer transition-colors"
                onClick={() => { onJobClick(job.gid); onClose(); }}
              >
                <span className="text-sm text-white/90 truncate" title={job.name}>{job.name}</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: healthBarColor(job.score) }}>
                  {job.score}
                </span>
                <span className={`text-sm tabular-nums ${isPastDue ? 'text-red-400 font-semibold' : 'text-white/50'}`}>
                  {job.due_on ? formatDate(job.due_on) : '—'}
                </span>
                <div className="flex gap-1 flex-wrap">
                  {job.hasRedo && <span className="text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded-full">REDO</span>}
                  {job.hasOverdueSubtask && <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded-full">Late sub</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CumulativeProgressSection({ data, onJobClick }) {
  const [activeDept,   setActiveDept]   = useState(null);
  const [activeHealth, setActiveHealth] = useState(null);

  const { departmentLoad, scorecards } = data;

  const deptSegments = useMemo(() =>
    STAGES.filter(s => s.key).map(s => ({
      ...s,
      tasks: departmentLoad[s.key]?.tasks ?? [],
      count: departmentLoad[s.key]?.tasks?.length ?? 0,
    })).filter(s => s.count > 0),
    [departmentLoad]
  );
  const totalDeptTasks = deptSegments.reduce((s, d) => s + d.count, 0);

  // Each job gets exactly one segment (most severe wins):
  // No Date → Late → Critical → At Risk → Watch → On Track
  const healthSegments = useMemo(() => {
    const buckets = {
      noDate:   { label: 'No Due Date', color: '#6b7280', jobs: [] },
      late:     { label: 'Late',        color: '#dc2626', jobs: [] },
      critical: { label: 'Critical',    color: '#ef4444', jobs: [] },
      risk:     { label: 'At Risk',     color: '#f97316', jobs: [] },
      watch:    { label: 'Watch',       color: '#eab308', jobs: [] },
      healthy:  { label: 'On Track',    color: '#22c55e', jobs: [] },
    };
    for (const j of scorecards) {
      if (!j.due_on)                   buckets.noDate.jobs.push(j);
      else if (j.due_on < TODAY)       buckets.late.jobs.push(j);
      else if (j.band === 'critical')  buckets.critical.jobs.push(j);
      else if (j.band === 'risk')      buckets.risk.jobs.push(j);
      else if (j.band === 'watch')     buckets.watch.jobs.push(j);
      else                             buckets.healthy.jobs.push(j);
    }
    return Object.values(buckets)
      .map(b => ({ ...b, count: b.jobs.length }))
      .filter(b => b.count > 0);
  }, [scorecards]);
  const totalJobs = scorecards.length;

  const avgHealth = totalJobs
    ? Math.round(scorecards.reduce((s, j) => s + j.score, 0) / totalJobs)
    : null;

  return (
    <>
      <div className="bg-slate-card border border-white/5 rounded-2xl p-5 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Overall Pipeline</h2>
          {avgHealth !== null && (
            <span className="text-sm font-bold" style={{ color: healthBarColor(avgHealth) }}>
              Avg health {avgHealth}
            </span>
          )}
        </div>

        {/* Stage distribution — clickable segments */}
        {totalDeptTasks > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs text-white/40 mb-2">
              <span>Active tasks by stage — click to view projects</span>
              <span>{totalDeptTasks} total</span>
            </div>
            <div className="flex h-7 rounded-lg overflow-hidden gap-px">
              {deptSegments.map(seg => (
                <button
                  key={seg.key}
                  title={`${seg.name}: ${seg.count} tasks`}
                  className="hover:brightness-125 transition-all focus:outline-none"
                  style={{ width: `${(seg.count / totalDeptTasks) * 100}%`, backgroundColor: seg.color }}
                  onClick={() => setActiveDept(seg)}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5">
              {deptSegments.map(seg => (
                <button
                  key={seg.key}
                  onClick={() => setActiveDept(seg)}
                  className="flex items-center gap-1.5 text-xs text-white/55 hover:text-white/90 transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }} />
                  {seg.name}
                  <span className="text-white/30">{seg.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Health distribution */}
        {totalJobs > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs text-white/40 mb-2">
              <span>Job health distribution — click to view jobs</span>
              <span>{totalJobs} jobs</span>
            </div>
            <div className="flex h-7 rounded-lg overflow-hidden gap-px">
              {healthSegments.map(seg => (
                <button
                  key={seg.label}
                  title={`${seg.label}: ${seg.count}`}
                  className="hover:brightness-125 transition-all focus:outline-none"
                  style={{ width: `${(seg.count / totalJobs) * 100}%`, backgroundColor: seg.color }}
                  onClick={() => setActiveHealth(seg)}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5">
              {healthSegments.map(seg => (
                <button key={seg.label} onClick={() => setActiveHealth(seg)}
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
      </div>

      {activeDept && (
        <DeptTasksModal
          stage={activeDept}
          tasks={activeDept.tasks}
          onClose={() => setActiveDept(null)}
        />
      )}
      {activeHealth && (
        <HealthJobsModal
          segment={activeHealth}
          onClose={() => setActiveHealth(null)}
          onJobClick={onJobClick}
        />
      )}
    </>
  );
}

// ─── KPI card ─────────────────────────────────────────────────

function KpiCard({ label, value, colorClass = 'text-white' }) {
  return (
    <div className="bg-slate-card border border-white/5 rounded-xl p-4">
      <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}

// ─── Alert panels ─────────────────────────────────────────────

function AlertPanel({ title, empty, children }) {
  const hasChildren = React.Children.count(children) > 0;
  const count = React.Children.count(children);
  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-6 min-h-[180px] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">{title}</h3>
        {hasChildren && (
          <span className="text-xs text-white/30 tabular-nums">{count}</span>
        )}
      </div>
      {hasChildren
        ? <div className="space-y-2.5 flex-1">{children}</div>
        : <p className="text-white/30 text-sm flex-1 flex items-center">{empty}</p>
      }
    </div>
  );
}

function AlertRow({ job, onClick }) {
  return (
    <div
      className="flex items-center gap-2 cursor-pointer hover:bg-white/[0.03] rounded px-1 -mx-1 py-1"
      onClick={onClick}
    >
      <HealthBadge score={job.score} band={job.band} />
      <span className="flex-1 text-xs text-white/80 truncate">{job.name}</span>
    </div>
  );
}

// ─── PM Portfolio ──────────────────────────────────────────────

const TODAY_STR = new Date().toISOString().slice(0, 10);

function computePmScore(tasks, scorecardMap) {
  const total = tasks.length;
  if (total === 0) return null;
  const onTimeCount    = tasks.filter(t => t.dueOn && t.dueOn >= TODAY_STR).length;
  const unprocessed    = tasks.filter(t => t.flag === 'urgent' || t.flag === 'mislabeled').length;
  const cleanCount     = tasks.filter(t => t.flag === 'green' || t.flag === 'yellow').length;
  const onTimeRate     = onTimeCount / total;
  const processedRate  = (total - unprocessed) / total;
  const auditCleanRate = cleanCount            / total;
  const healthScores   = tasks.map(t => scorecardMap[t.gid]?.score).filter(s => s != null);
  const avgHealth      = healthScores.length
    ? healthScores.reduce((a, b) => a + b, 0) / healthScores.length / 100
    : 0.5;
  return Math.round(onTimeRate * 40 + processedRate * 35 + auditCleanRate * 15 + avgHealth * 10);
}

function buildPmStats(pm, scorecardMap) {
  const tasks        = pm.tasks;
  const jobCount     = tasks.length;
  const overdueCount = tasks.filter(t => scorecardMap[t.gid]?.hasOverdueSubtask).length;
  const avgHealth    = computePmScore(tasks, scorecardMap);
  const stageBreakdown = {};
  for (const s of STAGES) stageBreakdown[s.name] = 0;
  let unprocessedCount = 0;
  for (const t of tasks) {
    // Only count as unprocessed if backend flagged it urgent (empty/untitled section)
    if (t.flag === 'urgent') { unprocessedCount++; continue; }
    const matched = matchStage(t.section);
    if (matched) stageBreakdown[matched.name]++;
  }
  return { name: pm.name, projectGid: pm.projectGid, jobCount, overdueCount, avgHealth, stageBreakdown, unprocessedCount };
}

const ACTIVE_PM_NAMES = ['Nikhil', 'Danish', 'Barbara'];

function PmCard({ pm, onClick }) {
  const { name, jobCount, overdueCount, avgHealth, stageBreakdown, unprocessedCount } = pm;
  const totalStaged = Object.values(stageBreakdown).reduce((a, b) => a + b, 0);
  const onTrackCount = jobCount - overdueCount - unprocessedCount;

  return (
    <div
      className="bg-slate-card border border-white/5 rounded-2xl p-8 space-y-6 cursor-pointer hover:border-white/20 hover:bg-white/[0.03] transition-colors"
      onClick={onClick}
    >
      {/* PM name + health score */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-2xl text-white">{name}</h3>
        {avgHealth !== null && (
          <div className="text-right">
            <span className="text-4xl font-black tabular-nums" style={{ color: healthBarColor(avgHealth) }}>
              {avgHealth}
            </span>
            <p className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">Health Score</p>
          </div>
        )}
      </div>

      {/* Health bar */}
      {avgHealth !== null && (
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all"
            style={{ width: `${avgHealth}%`, backgroundColor: healthBarColor(avgHealth) }} />
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white/[0.04] rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-white tabular-nums">{jobCount}</p>
          <p className="text-[11px] text-white/40 mt-1">Total Jobs</p>
        </div>
        <div className="bg-white/[0.04] rounded-xl p-4 text-center">
          <p className={`text-3xl font-bold tabular-nums ${overdueCount > 0 ? 'text-red-400' : 'text-white/30'}`}>{overdueCount}</p>
          <p className="text-[11px] text-white/40 mt-1">Overdue</p>
        </div>
        <div className="bg-white/[0.04] rounded-xl p-4 text-center">
          <p className={`text-3xl font-bold tabular-nums ${unprocessedCount > 0 ? 'text-red-400' : 'text-white/30'}`}>{unprocessedCount}</p>
          <p className="text-[11px] text-white/40 mt-1">Unprocessed</p>
        </div>
      </div>

      {/* Stage breakdown */}
      {(totalStaged > 0 || unprocessedCount > 0) && (
        <div>
          <div className="text-xs text-white/40 mb-2 font-medium">Stage Distribution</div>
          <div className="flex h-4 rounded-lg overflow-hidden gap-px">
            {STAGES.map(stage => {
              const count = stageBreakdown[stage.name];
              if (!count) return null;
              return (
                <div key={stage.name} title={`${stage.name}: ${count}`}
                  style={{ width: `${(count / jobCount) * 100}%`, backgroundColor: stage.color }} />
              );
            })}
            {unprocessedCount > 0 && (
              <div title={`Unprocessed: ${unprocessedCount}`}
                style={{ width: `${(unprocessedCount / jobCount) * 100}%`, backgroundColor: '#ef4444' }} />
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
            {STAGES.map(stage => {
              const count = stageBreakdown[stage.name];
              if (!count) return null;
              return (
                <span key={stage.name} className="flex items-center gap-1.5 text-xs text-white/55">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: stage.color }} />
                  {stage.name} <span className="text-white/30 font-semibold">{count}</span>
                </span>
              );
            })}
            {unprocessedCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-red-400 font-semibold">
                <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0 bg-red-500" />
                Unprocessed <span>{unprocessedCount}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniPmCard({ pm, onClick }) {
  const { name, jobCount, overdueCount, avgHealth, stageBreakdown, unprocessedCount } = pm;

  return (
    <div
      className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-3 flex items-center gap-4 cursor-pointer hover:border-white/15 hover:bg-white/[0.05] transition-colors"
      onClick={onClick}
    >
      {/* Name + flags */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white/80">{name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-white/40">{jobCount} jobs</span>
          {unprocessedCount > 0 && (
            <span className="text-[10px] text-red-400 font-semibold">🚨 {unprocessedCount}</span>
          )}
          {overdueCount > 0 && (
            <span className="text-[10px] text-red-400 font-semibold">{overdueCount} late</span>
          )}
        </div>
      </div>

      {/* Stage mini-bar */}
      {jobCount > 0 && (
        <div className="flex h-1.5 w-20 rounded-full overflow-hidden gap-px flex-shrink-0">
          {STAGES.map(stage => {
            const count = stageBreakdown[stage.name];
            if (!count) return null;
            return (
              <div key={stage.name} title={`${stage.name}: ${count}`}
                style={{ width: `${(count / jobCount) * 100}%`, backgroundColor: stage.color }} />
            );
          })}
          {unprocessedCount > 0 && (
            <div title={`Unprocessed: ${unprocessedCount}`}
              style={{ width: `${(unprocessedCount / jobCount) * 100}%`, backgroundColor: '#ef4444' }} />
          )}
        </div>
      )}

      {/* Health score */}
      {avgHealth !== null && (
        <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: healthBarColor(avgHealth) }}>
          {avgHealth}
        </span>
      )}
    </div>
  );
}

// ─── PM Detail Panel (inline expansion) ──────────────────────

function JobRow({ task, dueOn }) {
  const isLate = dueOn && dueOn < TODAY_STR;
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors border-b border-white/[0.04] last:border-b-0">
      <span className="flex-1 text-sm text-white/85 truncate" title={task.name}>{task.name}</span>
      <span className={`text-xs tabular-nums shrink-0 ${isLate ? 'text-red-400 font-semibold' : 'text-white/40'}`}>
        {dueOn
          ? new Date(dueOn + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : 'No date'}
      </span>
    </div>
  );
}

function JobColumn({ title, count, color, borderColor, tasks }) {
  return (
    <div className={`bg-slate-card border ${borderColor} rounded-2xl overflow-hidden flex flex-col`}>
      <div className="px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <h4 className={`text-sm font-semibold ${color}`}>{title}</h4>
          <span className={`text-2xl font-bold tabular-nums ${color}`}>{count}</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[400px]">
        {tasks.length === 0
          ? <p className="text-white/20 text-sm text-center py-8">None</p>
          : tasks.map(t => <JobRow key={t.gid} task={t} dueOn={t.dueOn} />)
        }
      </div>
    </div>
  );
}

function PmDetailPanel({ pm, tasks, scorecardMap, onClose }) {
  // Classify tasks into buckets
  const { needsReview, onTrack, atRisk, late } = useMemo(() => {
    const needsReview = [];
    const onTrack = [];
    const atRisk = [];
    const late = [];

    // "Close to late" threshold: due within 3 days
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const atRiskThreshold = threeDaysFromNow.toISOString().slice(0, 10);

    for (const t of tasks) {
      // Unprocessed = needs review (top priority)
      if (t.flag === 'urgent' || t.flag === 'mislabeled') {
        needsReview.push(t);
        continue;
      }
      // Late: past due date
      if (t.dueOn && t.dueOn < TODAY_STR) {
        late.push(t);
      }
      // At risk: due within 3 days (but not late)
      else if (t.dueOn && t.dueOn <= atRiskThreshold) {
        atRisk.push(t);
      }
      // On track: everything else
      else {
        onTrack.push(t);
      }
    }

    // Sort each by due date
    const byDue = (a, b) => (a.dueOn ?? '9999') < (b.dueOn ?? '9999') ? -1 : 1;
    needsReview.sort(byDue);
    onTrack.sort(byDue);
    atRisk.sort(byDue);
    late.sort(byDue);

    return { needsReview, onTrack, atRisk, late };
  }, [tasks]);

  return (
    <div className="bg-[#1a1a2e] border border-white/10 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-bold text-white">{pm.name}</h3>
          <span className="text-sm text-white/40">{tasks.length} total jobs</span>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/80 text-2xl leading-none px-2">×</button>
      </div>

      <div className="p-6 space-y-6">
        {/* Needs Review — top priority, large module */}
        <div className={`rounded-2xl overflow-hidden ${needsReview.length > 0 ? 'bg-red-500/10 border border-red-500/25' : 'bg-slate-card border border-white/5'}`}>
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🚨</span>
              <h4 className="text-base font-semibold text-red-400">Needs Review</h4>
            </div>
            <span className={`text-3xl font-black tabular-nums ${needsReview.length > 0 ? 'text-red-400' : 'text-white/20'}`}>
              {needsReview.length}
            </span>
          </div>
          <div className="max-h-[250px] overflow-y-auto">
            {needsReview.length === 0
              ? <p className="text-white/30 text-sm text-center py-6">All jobs have been reviewed</p>
              : needsReview.map(t => <JobRow key={t.gid} task={t} dueOn={t.dueOn} />)
            }
          </div>
        </div>

        {/* 3-column layout: On Track | At Risk | Late */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <JobColumn
            title="On Track"
            count={onTrack.length}
            color="text-green-400"
            borderColor="border-green-500/20"
            tasks={onTrack}
          />
          <JobColumn
            title="Getting Close"
            count={atRisk.length}
            color="text-yellow-400"
            borderColor="border-yellow-500/20"
            tasks={atRisk}
          />
          <JobColumn
            title="Late"
            count={late.length}
            color="text-red-400"
            borderColor="border-red-500/25"
            tasks={late}
          />
        </div>
      </div>
    </div>
  );
}

// ─── PM Portfolio Section ─────────────────────────────────────

function PmPortfolioSection({ auditData, scorecards, onAuditPmClick }) {
  const [expandedPm, setExpandedPm] = useState(null);

  const scorecardMap = useMemo(() => {
    const map = {};
    for (const sc of scorecards) map[sc.gid] = sc;
    return map;
  }, [scorecards]);

  const allStats = auditData.pms.map(pm => buildPmStats(pm, scorecardMap));
  const activeStats    = allStats.filter(pm => ACTIVE_PM_NAMES.includes(pm.name));
  const unmanagedStats = allStats.filter(pm => !ACTIVE_PM_NAMES.includes(pm.name) && pm.jobCount > 0);
  const unmanagedTotal = unmanagedStats.reduce((s, pm) => s + pm.jobCount, 0);

  // Find the raw PM data for the expanded PM
  const expandedPmData = expandedPm ? auditData.pms.find(pm => pm.name === expandedPm) : null;
  const expandedPmStats = expandedPm ? activeStats.find(pm => pm.name === expandedPm) : null;

  function handlePmClick(name) {
    setExpandedPm(prev => prev === name ? null : name);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">PM Portfolio</h2>

      {/* Active PMs — large cards, 3 across */}
      {activeStats.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {activeStats.map(pm => (
            <PmCard key={pm.projectGid} pm={pm} onClick={() => handlePmClick(pm.name)} />
          ))}
        </div>
      )}

      {/* Expanded PM detail panel */}
      {expandedPmData && expandedPmStats && (
        <PmDetailPanel
          pm={expandedPmStats}
          tasks={expandedPmData.tasks}
          scorecardMap={scorecardMap}
          onClose={() => setExpandedPm(null)}
        />
      )}

      {/* Unmanaged projects — flagged as needing reassignment */}
      {unmanagedTotal > 0 && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-red-400 text-lg">⚠️</span>
            <h3 className="text-sm font-semibold text-red-400">
              Unmanaged Projects — {unmanagedTotal} jobs need reassignment
            </h3>
          </div>
          <p className="text-xs text-white/40">
            These projects belong to inactive PMs and are not being actively managed. Reassign to Nikhil, Danish, or Barbara.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {unmanagedStats.map(pm => (
              <MiniPmCard key={pm.projectGid} pm={pm} onClick={() => onAuditPmClick?.(pm.name)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────

export default function OverviewTab({ data, auditData, onJobClick, onAuditPmClick }) {
  const { totals, scorecards } = data;
  const criticalJobs = scorecards.filter(j => j.band === 'critical').slice(0, 8);
  const overdueJobs  = scorecards.filter(j => j.hasOverdueSubtask).slice(0, 8);
  const redoJobs     = scorecards.filter(j => j.hasRedo).slice(0, 8);

  return (
    <div className="space-y-6">

      {/* PM Portfolio — top, most important */}
      {auditData && (
        <PmPortfolioSection auditData={auditData} scorecards={scorecards} onAuditPmClick={onAuditPmClick} />
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Active Jobs"       value={totals.active} />
        <KpiCard label="On Track"          value={totals.onTrack}         colorClass="text-success" />
        <KpiCard label="At Risk"           value={totals.atRisk}          colorClass="text-yellow-400" />
        <KpiCard label="Critical"          value={totals.critical}        colorClass="text-danger" />
        <KpiCard label="REDOs"             value={totals.redos}           colorClass="text-orange-400" />
        <KpiCard label="Overdue Subtasks"  value={totals.overdueSubtasks} colorClass="text-red-400" />
      </div>

      {/* Alerts — large 3-across cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AlertPanel title="🔴 Critical Jobs" empty="No critical jobs">
          {criticalJobs.map(j => (
            <AlertRow key={j.gid} job={j} onClick={() => onJobClick(j.gid)} />
          ))}
        </AlertPanel>
        <AlertPanel title="⚠️ Overdue Subtasks" empty="No overdue subtasks">
          {overdueJobs.map(j => (
            <AlertRow key={j.gid} job={j} onClick={() => onJobClick(j.gid)} />
          ))}
        </AlertPanel>
        <AlertPanel title="🔄 REDOs in Flight" empty="No REDOs">
          {redoJobs.map(j => (
            <AlertRow key={j.gid} job={j} onClick={() => onJobClick(j.gid)} />
          ))}
        </AlertPanel>
      </div>

      {/* Overall pipeline — moved below alerts */}
      <CumulativeProgressSection data={data} onJobClick={onJobClick} />

    </div>
  );
}
