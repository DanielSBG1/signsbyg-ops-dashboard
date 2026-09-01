import React, { useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import HealthBadge from './HealthBadge';

// \u2500\u2500\u2500 Constants \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

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
  if (!dateStr) return '\u2014';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

// \u2500\u2500\u2500 Department tasks modal \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

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
        className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0"
          style={{ backgroundColor: `${stage.color}20` }}>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: stage.color }} />
            <span className="text-lg font-bold text-gray-900">{stage.name}</span>
            <span className="text-sm text-gray-500">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">\u00d7</button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_120px_120px_90px] gap-4 px-6 py-3 border-b border-gray-200 bg-black/[0.01] flex-shrink-0">
          {DEPT_SORT_COLS.map(col => (
            <button
              key={col.key}
              onClick={() => handleCol(col.key)}
              className={`text-left text-xs uppercase tracking-wider font-semibold flex items-center gap-1 transition-colors ${
                sortCol === col.key ? 'text-yellow-300' : 'text-gray-500 hover:text-gray-600'
              }`}
            >
              {col.label}
              {sortCol === col.key && <span className="text-[10px]">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
            </button>
          ))}
        </div>

        {/* Rows */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
          {rows.map(task => {
            const isOverdue = task.due_on && task.due_on < TODAY;
            return (
              <div
                key={task.gid}
                className="grid grid-cols-[1fr_120px_120px_90px] gap-4 items-center px-6 py-3 hover:bg-black/[0.02]"
              >
                <span className="text-sm text-gray-800 truncate" title={task.name}>{task.name}</span>
                <span className="text-sm text-gray-500 truncate">{task.assignee ?? '\u2014'}</span>
                <span className={`text-sm tabular-nums ${isOverdue ? 'text-red-400 font-semibold' : 'text-gray-500'}`}>
                  {formatDate(task.due_on)}
                  {isOverdue && <span className="ml-1 text-xs">(late)</span>}
                </span>
                <span>
                  {task.isRedo
                    ? <span className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full">REDO</span>
                    : isOverdue
                      ? <span className="text-xs text-red-400/70">Overdue</span>
                      : <span className="text-xs text-gray-500">\u2014</span>
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

// \u2500\u2500\u2500 Cumulative progress section \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

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
        className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0"
          style={{ backgroundColor: `${segment.color}22` }}>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: segment.color }} />
            <span className="text-lg font-bold text-gray-900">{segment.label}</span>
            <span className="text-sm text-gray-500">{segment.count} job{segment.count !== 1 ? 's' : ''}</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">\u00d7</button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_80px_120px_80px] gap-4 px-6 py-3 border-b border-gray-200 bg-black/[0.01] flex-shrink-0">
          {COLS.map(col => (
            <button key={col.key} onClick={() => handleCol(col.key)}
              className={`text-left text-xs uppercase tracking-wider font-semibold flex items-center gap-1 transition-colors ${
                sortCol === col.key ? 'text-yellow-300' : 'text-gray-500 hover:text-gray-600'
              }`}
            >
              {col.label}
              {sortCol === col.key && <span className="text-[10px]">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
            </button>
          ))}
          <span className="text-xs uppercase tracking-wider text-gray-500">Flags</span>
        </div>

        {/* Rows */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
          {rows.map(job => {
            const isPastDue = job.due_on && job.due_on < TODAY;
            return (
              <div
                key={job.gid}
                className="grid grid-cols-[1fr_80px_120px_80px] gap-4 items-center px-6 py-3 hover:bg-black/[0.02] cursor-pointer transition-colors"
                onClick={() => { onJobClick(job.gid); onClose(); }}
              >
                <span className="text-sm text-gray-900 truncate" title={job.name}>{job.name}</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: healthBarColor(job.score) }}>
                  {job.score}
                </span>
                <span className={`text-sm tabular-nums ${isPastDue ? 'text-red-400 font-semibold' : 'text-gray-500'}`}>
                  {job.due_on ? formatDate(job.due_on) : '\u2014'}
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
  // No Date \u2192 Late \u2192 Critical \u2192 At Risk \u2192 Watch \u2192 On Track
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
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Overall Pipeline</h2>
          {avgHealth !== null && (
            <span className="text-sm font-bold" style={{ color: healthBarColor(avgHealth) }}>
              Avg health {avgHealth}
            </span>
          )}
        </div>

        {/* Stage distribution \u2014 clickable segments */}
        {totalDeptTasks > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>Active tasks by stage \u2014 click to view projects</span>
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
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }} />
                  {seg.name}
                  <span className="text-gray-500">{seg.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Health distribution */}
        {totalJobs > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>Job health distribution \u2014 click to view jobs</span>
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
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }} />
                  {seg.label}
                  <span className="text-gray-500">{seg.count}</span>
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

// \u2500\u2500\u2500 KPI card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function KpiCard({ label, value, colorClass = 'text-gray-900' }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}

// \u2500\u2500\u2500 Alert panels \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function AlertPanel({ title, empty, children }) {
  const hasChildren = React.Children.count(children) > 0;
  const count = React.Children.count(children);
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 min-h-[180px] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">{title}</h3>
        {hasChildren && (
          <span className="text-xs text-gray-500 tabular-nums">{count}</span>
        )}
      </div>
      {hasChildren
        ? <div className="space-y-2.5 flex-1">{children}</div>
        : <p className="text-gray-500 text-sm flex-1 flex items-center">{empty}</p>
      }
    </div>
  );
}

function AlertRow({ job, onClick }) {
  return (
    <div
      className="flex items-center gap-2 cursor-pointer hover:bg-black/[0.02] rounded px-1 -mx-1 py-1"
      onClick={onClick}
    >
      <HealthBadge score={job.score} band={job.band} />
      <span className="flex-1 text-xs text-gray-700 truncate">{job.name}</span>
    </div>
  );
}

// \u2500\u2500\u2500 PM Portfolio \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

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
      className="bg-white border border-gray-200 rounded-2xl p-8 space-y-6 cursor-pointer hover:border-gray-300 hover:bg-black/[0.02] transition-colors"
      onClick={onClick}
    >
      {/* PM name + health score */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-2xl text-gray-900">{name}</h3>
        {avgHealth !== null && (
          <div className="text-right">
            <span className="text-4xl font-black tabular-nums" style={{ color: healthBarColor(avgHealth) }}>
              {avgHealth}
            </span>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">Health Score</p>
          </div>
        )}
      </div>

      {/* Health bar */}
      {avgHealth !== null && (
        <div className="h-3 bg-black/[0.05] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all"
            style={{ width: `${avgHealth}%`, backgroundColor: healthBarColor(avgHealth) }} />
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-black/[0.02] rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-gray-900 tabular-nums">{jobCount}</p>
          <p className="text-[11px] text-gray-500 mt-1">Total Jobs</p>
        </div>
        <div className="bg-black/[0.02] rounded-xl p-4 text-center">
          <p className={`text-3xl font-bold tabular-nums ${overdueCount > 0 ? 'text-red-400' : 'text-gray-500'}`}>{overdueCount}</p>
          <p className="text-[11px] text-gray-500 mt-1">Overdue</p>
        </div>
        <div className="bg-black/[0.02] rounded-xl p-4 text-center">
          <p className={`text-3xl font-bold tabular-nums ${unprocessedCount > 0 ? 'text-red-400' : 'text-gray-500'}`}>{unprocessedCount}</p>
          <p className="text-[11px] text-gray-500 mt-1">Unprocessed</p>
        </div>
      </div>

      {/* Stage breakdown */}
      {(totalStaged > 0 || unprocessedCount > 0) && (
        <div>
          <div className="text-xs text-gray-500 mb-2 font-medium">Stage Distribution</div>
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
                <span key={stage.name} className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: stage.color }} />
                  {stage.name} <span className="text-gray-500 font-semibold">{count}</span>
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
      className="bg-black/[0.02] border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4 cursor-pointer hover:border-gray-200 hover:bg-black/[0.03] transition-colors"
      onClick={onClick}
    >
      {/* Name + flags */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-700">{name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-gray-500">{jobCount} jobs</span>
          {unprocessedCount > 0 && (
            <span className="text-[10px] text-red-400 font-semibold">\ud83d\udea8 {unprocessedCount}</span>
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

// \u2500\u2500\u2500 PM Detail Panel (inline expansion) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function formatShortDate(dateStr) {
  if (!dateStr) return 'No date';
  const d = dateStr.length === 10 ? dateStr + 'T12:00:00Z' : dateStr;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function JobRow({ task, dueOn, showLastActivity }) {
  const isLate = dueOn && dueOn < TODAY_STR;
  const dateLabel = showLastActivity
    ? (task.lastActivity ? formatShortDate(task.lastActivity) : 'Never')
    : formatShortDate(dueOn);
  const dateColor = showLastActivity
    ? 'text-orange-400'
    : isLate ? 'text-red-400 font-semibold' : 'text-gray-500';

  return (
    <a
      href={`https://app.asana.com/0/0/${task.gid}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 px-4 py-3 hover:bg-black/[0.03] transition-colors border-b border-gray-200 last:border-b-0 cursor-pointer group"
    >
      <span className="flex-1 text-sm text-gray-800 truncate group-hover:text-gray-900" title={task.name}>{task.name}</span>
      <span className={`text-xs tabular-nums shrink-0 ${dateColor}`}>{dateLabel}</span>
    </a>
  );
}

const VIRTUALIZE_THRESHOLD = 20;
const COLUMN_HEIGHT = 400;
const ROW_ESTIMATE = 48;

function VirtualJobList({ tasks, showLastActivity }) {
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 5,
  });

  return (
    <div ref={parentRef} style={{ height: `${COLUMN_HEIGHT}px`, overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const t = tasks[virtualRow.index];
          return (
            <div
              key={t.gid}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <JobRow task={t} dueOn={t.dueOn} showLastActivity={showLastActivity} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JobColumn({ title, count, color, borderColor, tasks, showLastActivity }) {
  const useVirtual = tasks.length > VIRTUALIZE_THRESHOLD;

  return (
    <div className={`bg-white border ${borderColor} rounded-2xl overflow-hidden flex flex-col`}>
      <div className="px-5 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h4 className={`text-sm font-semibold ${color}`}>{title}</h4>
          <span className={`text-2xl font-bold tabular-nums ${color}`}>{count}</span>
        </div>
      </div>
      {tasks.length === 0
        ? <p className="text-gray-500 text-sm text-center py-8">None</p>
        : useVirtual
          ? <VirtualJobList tasks={tasks} showLastActivity={showLastActivity} />
          : (
            <div className="flex-1 overflow-y-auto max-h-[400px]">
              {tasks.map(t => <JobRow key={t.gid} task={t} dueOn={t.dueOn} showLastActivity={showLastActivity} />)}
            </div>
          )
      }
    </div>
  );
}

function PmDetailPanel({ pm, tasks, scorecardMap, onClose }) {
  // Classify tasks into buckets
  const { unreviewed, stale, onTrack, atRisk, late } = useMemo(() => {
    const unreviewed = [];
    const stale = [];
    const onTrack = [];
    const atRisk = [];
    const late = [];

    // "Close to late" threshold: due within 3 days
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const atRiskThreshold = threeDaysFromNow.toISOString().slice(0, 10);

    // Stale = no comment activity in 48+ hours
    const now = Date.now();
    const STALE_MS = 48 * 60 * 60 * 1000;

    for (const t of tasks) {
      if (t.flag === 'urgent' || t.flag === 'mislabeled') {
        unreviewed.push(t);
        continue;
      }

      // Check if stale (no activity in 48h+)
      const lastMs = t.lastActivity ? new Date(t.lastActivity).getTime() : 0;
      const isStale = !t.lastActivity || (now - lastMs > STALE_MS);

      // Check scorecard for subtask health
      const sc = scorecardMap[t.gid];
      const hasProblems = sc?.hasOverdueSubtask || sc?.band === 'critical' || sc?.band === 'risk';

      if (t.dueOn && t.dueOn < TODAY_STR) {
        late.push(t);
      } else if (t.dueOn && t.dueOn <= atRiskThreshold && hasProblems) {
        // Only "at risk" if due soon AND subtasks are behind
        atRisk.push(t);
      } else if (isStale) {
        stale.push(t);
      } else {
        onTrack.push(t);
      }
    }

    const byDue = (a, b) => (a.dueOn ?? '9999') < (b.dueOn ?? '9999') ? -1 : 1;
    // Sort stale by last activity (oldest first)
    const byActivity = (a, b) => (a.lastActivity ?? '') < (b.lastActivity ?? '') ? -1 : 1;
    unreviewed.sort(byDue);
    stale.sort(byActivity);
    onTrack.sort(byDue);
    atRisk.sort(byDue);
    late.sort(byDue);

    return { unreviewed, stale, onTrack, atRisk, late };
  }, [tasks]);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* Header with health bar */}
      <div className="px-6 py-5 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold text-gray-900">{pm.name}</h3>
            <span className="text-sm text-gray-500">{tasks.length} total jobs</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none px-2">&times;</button>
        </div>
        {/* Health bar */}
        {pm.avgHealth !== null && (
          <div className="flex items-center gap-4">
            <div className="flex-1 h-3 bg-black/[0.05] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${pm.avgHealth}%`, backgroundColor: healthBarColor(pm.avgHealth) }} />
            </div>
            <span className="text-lg font-bold tabular-nums shrink-0" style={{ color: healthBarColor(pm.avgHealth) }}>
              {pm.avgHealth}
            </span>
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* UNREVIEWED JOBS */}
        <div className={`rounded-2xl overflow-hidden ${unreviewed.length > 0 ? 'bg-red-500/10 border border-red-500/25' : 'bg-white border border-gray-200'}`}>
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h4 className="text-sm font-black uppercase tracking-widest text-red-400">Unreviewed Jobs</h4>
            <span className={`text-3xl font-black tabular-nums ${unreviewed.length > 0 ? 'text-red-400' : 'text-gray-500'}`}>
              {unreviewed.length}
            </span>
          </div>
          <div className="max-h-[250px] overflow-y-auto">
            {unreviewed.length === 0
              ? <p className="text-gray-500 text-sm text-center py-6">All jobs have been reviewed</p>
              : unreviewed.map(t => <JobRow key={t.gid} task={t} dueOn={t.dueOn} />)
            }
          </div>
        </div>

        {/* 4-column layout: On Track | Stale | Getting Close | Late */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <JobColumn
            title="On Track"
            count={onTrack.length}
            color="text-green-400"
            borderColor="border-green-500/20"
            tasks={onTrack}
          />
          <JobColumn
            title="Stale (48h+)"
            count={stale.length}
            color="text-orange-400"
            borderColor="border-orange-500/20"
            tasks={stale}
            showLastActivity
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

// \u2500\u2500\u2500 PM Portfolio Section \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

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
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">PM Portfolio</h2>

      {/* Active PMs \u2014 large cards (hidden when one is expanded) */}
      {!expandedPm && activeStats.length > 0 && (
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

      {/* Unmanaged projects \u2014 flagged as needing reassignment */}
      {unmanagedTotal > 0 && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-red-400">
              Unmanaged Projects &mdash; {unmanagedTotal} jobs need reassignment
            </h3>
          </div>
          <p className="text-xs text-gray-500">
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

// \u2500\u2500\u2500 Main tab \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export default function OverviewTab({ data, auditData, onJobClick, onAuditPmClick }) {
  const { totals, scorecards } = data;
  const criticalJobs = scorecards.filter(j => j.band === 'critical').slice(0, 8);
  const overdueJobs  = scorecards.filter(j => j.hasOverdueSubtask).slice(0, 8);
  const redoJobs     = scorecards.filter(j => j.hasRedo).slice(0, 8);

  return (
    <div className="space-y-6">

      {/* Overall pipeline \u2014 top */}
      <CumulativeProgressSection data={data} onJobClick={onJobClick} />

      {/* PM Portfolio */}
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

      {/* Alerts \u2014 large 3-across cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AlertPanel title="Critical Jobs" empty="No critical jobs">
          {criticalJobs.map(j => (
            <AlertRow key={j.gid} job={j} onClick={() => onJobClick(j.gid)} />
          ))}
        </AlertPanel>
        <AlertPanel title="Overdue Subtasks" empty="No overdue subtasks">
          {overdueJobs.map(j => (
            <AlertRow key={j.gid} job={j} onClick={() => onJobClick(j.gid)} />
          ))}
        </AlertPanel>
        <AlertPanel title="REDOs in Flight" empty="No REDOs">
          {redoJobs.map(j => (
            <AlertRow key={j.gid} job={j} onClick={() => onJobClick(j.gid)} />
          ))}
        </AlertPanel>
      </div>

    </div>
  );
}
