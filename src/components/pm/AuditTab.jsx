import React, { useMemo, useState, useEffect } from 'react';

// ─── Constants ────────────────────────────────────────────────

const STAGES = [
  { name: 'Design',       color: '#3b82f6' },
  { name: 'Permitting',   color: '#a855f7' },
  { name: 'Production',   color: '#f97316' },
  { name: 'Installation', color: '#eab308' },
  { name: 'Invoicing',    color: '#22c55e' },
  { name: 'On Hold',      color: '#6b7280' },
];

const FLAG_ORDER = ['urgent', 'mislabeled', 'red', 'yellow', 'green'];

const FLAG_META = {
  urgent: {
    emoji: '🚨', label: 'Unprocessed',
    border: 'border-red-500/60', bg: 'bg-red-500/10', text: 'text-red-400',
    badge: 'bg-red-500/20 text-red-400 border border-red-500/40',
    auditPenalty: 15,
  },
  mislabeled: {
    emoji: '⚠️', label: 'Mislabeled',
    border: 'border-orange-500/50', bg: 'bg-orange-500/10', text: 'text-orange-400',
    badge: 'bg-orange-500/20 text-orange-400 border border-orange-500/40',
    auditPenalty: 10,
  },
  red: {
    emoji: '🔴', label: 'Red',
    border: 'border-red-500/40', bg: 'bg-red-500/5', text: 'text-red-400',
    badge: 'bg-red-500/20 text-red-400 border border-red-500/40',
    auditPenalty: 8,
  },
  yellow: {
    emoji: '🟡', label: 'Yellow',
    border: 'border-yellow-500/40', bg: 'bg-yellow-500/5', text: 'text-yellow-400',
    badge: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40',
    auditPenalty: 3,
  },
  green: {
    emoji: '✅', label: 'Clear',
    border: 'border-green-500/20', bg: 'bg-green-500/5', text: 'text-green-400',
    badge: 'bg-green-500/20 text-green-400 border border-green-500/30',
    auditPenalty: 0,
  },
};

const SORT_COLS = [
  { key: 'flag',         label: 'Status' },
  { key: 'name',         label: 'Name' },
  { key: 'lastActivity', label: 'Activity' },
  { key: 'dueOn',        label: 'Due Date' },
  { key: 'issues',       label: 'Issues' },
];

// ─── Utilities ────────────────────────────────────────────────

function matchStage(section) {
  const lower = (section ?? '').toLowerCase();
  return STAGES.find(s => lower.includes(s.name.toLowerCase())) ?? null;
}

function healthBarColor(score) {
  // Smooth gradient: red (0) → yellow (50) → green (100)
  const t = Math.max(0, Math.min(100, score)) / 100;
  let r, g;
  if (t <= 0.5) {
    // red → yellow: r stays 239, g goes 68 → 234
    r = 239;
    g = Math.round(68 + (234 - 68) * (t / 0.5));
  } else {
    // yellow → green: r goes 234 → 34, g goes 234 → 197
    r = Math.round(234 + (34 - 234) * ((t - 0.5) / 0.5));
    g = Math.round(234 + (197 - 234) * ((t - 0.5) / 0.5));
  }
  return `rgb(${r},${g},68)`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

function asanaUrl(projectGid, taskGid) {
  return `https://app.asana.com/0/${projectGid}/${taskGid}/f`;
}

function sortedTasks(tasks, col, dir) {
  return [...tasks].sort((a, b) => {
    let av, bv;
    if (col === 'flag')         { av = FLAG_ORDER.indexOf(a.flag); bv = FLAG_ORDER.indexOf(b.flag); }
    if (col === 'name')         { av = (a.name ?? '').toLowerCase(); bv = (b.name ?? '').toLowerCase(); }
    if (col === 'lastActivity') { av = a.lastActivity ?? ''; bv = b.lastActivity ?? ''; }
    if (col === 'dueOn')        { av = a.dueOn ?? '9999-99-99'; bv = b.dueOn ?? '9999-99-99'; }
    if (col === 'issues')       { av = (a.reasons ?? []).length; bv = (b.reasons ?? []).length; }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ?  1 : -1;
    return 0;
  });
}

// ─── Task detail modal ────────────────────────────────────────

function TaskDetailModal({ task, projectGid, onClose }) {
  const meta     = FLAG_META[task.flag] ?? FLAG_META.green;
  const isPastDue = task.dueOn && task.dueOn < new Date().toISOString().slice(0, 10);

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1e1e30] border border-white/10 rounded-2xl shadow-2xl max-w-lg w-full space-y-5 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div
          className={`px-6 pt-5 pb-4 border-b border-white/5 ${meta.bg}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5 flex-1 min-w-0">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded ${meta.badge}`}>
                {meta.emoji} {meta.label}
              </span>
              <h3 className="text-base font-semibold text-white leading-snug">{task.name}</h3>
              {task.section && (
                <p className="text-xs text-white/40 uppercase tracking-wider">{task.section}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-white/30 hover:text-white/80 text-2xl leading-none mt-0.5 flex-shrink-0"
            >
              ×
            </button>
          </div>
        </div>

        <div className="px-6 pb-6 space-y-5">
          {/* Issues */}
          {(task.reasons ?? []).length > 0 && (
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Issues Found</p>
              <ul className="space-y-1.5 pl-4">
                {task.reasons.map((r, i) => (
                  <li key={i} className={`text-sm ${meta.text} list-disc`}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended action */}
          {task.recommendedAction && (
            <div className={`${meta.bg} border ${meta.border} rounded-xl px-4 py-3`}>
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Recommended Action</p>
              <p className="text-sm text-white/80">{task.recommendedAction}</p>
            </div>
          )}

          {/* Date row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Last Activity</p>
              <p className="text-sm text-white/70">{formatDate(task.lastActivity)}</p>
            </div>
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Due Date</p>
              <p className={`text-sm ${isPastDue ? 'text-red-400 font-semibold' : 'text-white/70'}`}>
                {task.dueOn ? formatDate(task.dueOn) : '—'}
                {isPastDue && <span className="ml-1 text-xs">(overdue)</span>}
              </p>
            </div>
          </div>

          {/* Asana link */}
          {projectGid && task.gid && (
            <a
              href={asanaUrl(projectGid, task.gid)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm text-white/60 hover:text-white border border-white/10 hover:border-white/30 px-4 py-2.5 rounded-xl transition-colors"
            >
              Open in Asana ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Compact task mini-card ───────────────────────────────────

function TaskMiniCard({ task, onClick }) {
  const meta       = FLAG_META[task.flag] ?? FLAG_META.green;
  const issueCount = (task.reasons ?? []).length;

  return (
    <button
      className={`w-full text-left border ${meta.border} ${meta.bg} rounded-xl p-3 hover:brightness-110 transition-all space-y-2 cursor-pointer`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-lg leading-none">{meta.emoji}</span>
        {issueCount > 0 && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${meta.badge}`}>
            {issueCount}
          </span>
        )}
      </div>
      <p
        className="text-xs text-white/85 leading-snug overflow-hidden"
        title={task.name}
        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {task.name}
      </p>
      <p className="text-[10px] text-white/30 truncate">{formatDate(task.lastActivity)}</p>
    </button>
  );
}

// ─── Department expanded modal ────────────────────────────────

function DeptModal({ stage, tasks, projectGid, onClose }) {
  const [sortCol,      setSortCol]      = useState('flag');
  const [sortDir,      setSortDir]      = useState('asc');
  const [selectedTask, setSelectedTask] = useState(null);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !selectedTask) onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, selectedTask]);

  function handleColClick(key) {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(key); setSortDir('asc'); }
  }

  const rows = sortedTasks(tasks, sortCol, sortDir);
  const today = new Date().toISOString().slice(0, 10);

  const COLS = [
    { key: 'flag',         label: 'Status',        cls: 'justify-center' },
    { key: 'name',         label: 'Job Name',       cls: '' },
    { key: 'lastActivity', label: 'Last Activity',  cls: '' },
    { key: 'dueOn',        label: 'Due Date',       cls: '' },
    { key: 'issues',       label: 'Issues',         cls: '' },
  ];

  return (
    <>
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-[#1e1e30] border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Modal header */}
          <div
            className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0"
            style={{ backgroundColor: 'rgba(234,179,8,0.10)' }}
          >
            <div className="flex items-center gap-3">
              <span className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: stage.color }} />
              <span className="text-lg font-bold" style={{ color: '#fde047' }}>{stage.name}</span>
              <span className="text-sm text-white/40">{tasks.length} job{tasks.length !== 1 ? 's' : ''}</span>
            </div>
            <button onClick={onClose} className="text-white/30 hover:text-white/80 text-2xl leading-none">×</button>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[28px_1fr_130px_120px_100px_28px] gap-4 px-6 py-3 border-b border-white/5 flex-shrink-0 bg-white/[0.02]">
            {COLS.map(col => (
              <button
                key={col.key}
                onClick={() => handleColClick(col.key)}
                className={`text-xs uppercase tracking-wider font-semibold flex items-center gap-1 transition-colors ${
                  sortCol === col.key ? 'text-yellow-300' : 'text-white/35 hover:text-white/65'
                } ${col.cls}`}
              >
                {col.label}
                {sortCol === col.key && <span className="text-[10px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
              </button>
            ))}
            <span />
          </div>

          {/* Scrollable rows */}
          <div className="overflow-y-auto flex-1 divide-y divide-white/[0.04]">
            {rows.map(task => {
              const meta       = FLAG_META[task.flag] ?? FLAG_META.green;
              const isPastDue  = task.dueOn && task.dueOn < today;
              const issueCount = (task.reasons ?? []).length;
              return (
                <div
                  key={task.gid ?? task.name}
                  className="grid grid-cols-[28px_1fr_130px_120px_100px_28px] gap-4 items-center px-6 py-3.5 hover:bg-white/[0.04] cursor-pointer transition-colors group"
                  onClick={() => setSelectedTask(task)}
                >
                  <span className="text-base text-center">{meta.emoji}</span>
                  <span className="text-sm text-white/90 truncate group-hover:text-white" title={task.name}>{task.name}</span>
                  <span className="text-sm text-white/45 tabular-nums">{formatDate(task.lastActivity)}</span>
                  <span className={`text-sm tabular-nums ${isPastDue ? 'text-red-400 font-semibold' : 'text-white/45'}`}>
                    {task.dueOn ? formatDate(task.dueOn) : '—'}
                  </span>
                  <span>
                    {issueCount > 0
                      ? <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${meta.badge}`}>{issueCount} issue{issueCount !== 1 ? 's' : ''}</span>
                      : <span className="text-xs text-green-400/60">Clear</span>
                    }
                  </span>
                  <a
                    href={asanaUrl(projectGid, task.gid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-white/20 hover:text-white/70 text-sm transition-colors"
                  >↗</a>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          projectGid={projectGid}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </>
  );
}

// ─── Department card (compact, opens DeptModal on click) ──────

function DeptSection({ stage, tasks, projectGid }) {
  const [modalOpen,  setModalOpen]  = useState(false);

  const urgentCount = tasks.filter(t => t.flag === 'urgent').length;
  const redCount    = tasks.filter(t => t.flag === 'red').length;
  const yellowCount = tasks.filter(t => t.flag === 'yellow').length;
  const greenCount  = tasks.filter(t => t.flag === 'green').length;
  const hasBad      = urgentCount > 0 || redCount > 0;

  return (
    <>
      <button
        className={`w-full text-left rounded-2xl border flex flex-col overflow-hidden transition-all hover:brightness-110 hover:border-white/25 ${hasBad ? 'border-red-500/30' : 'border-white/10'}`}
        onClick={() => setModalOpen(true)}
      >
        {/* Colored header strip */}
        <div
          className="w-full px-4 py-3"
          style={{ backgroundColor: hasBad ? 'rgba(239,68,68,0.18)' : 'rgba(234,179,8,0.12)' }}
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: stage.color }} />
            <span className="text-sm font-bold" style={{ color: '#fde047' }}>{stage.name}</span>
            <span className="text-xs text-white/40 ml-auto">{tasks.length} jobs</span>
          </div>
        </div>

        {/* Flag chips */}
        <div className="px-4 py-3 bg-white/[0.02] flex items-center gap-1.5 flex-wrap">
          {urgentCount > 0 && <span className="text-xs bg-red-500/25 text-red-400 px-2 py-0.5 rounded-full font-bold">🚨 {urgentCount}</span>}
          {redCount    > 0 && <span className="text-xs bg-red-500/20  text-red-400 px-2 py-0.5 rounded-full font-bold">🔴 {redCount}</span>}
          {yellowCount > 0 && <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">🟡 {yellowCount}</span>}
          {greenCount  > 0 && <span className="text-xs bg-green-500/20  text-green-400 px-2 py-0.5 rounded-full">✅ {greenCount}</span>}
          {tasks.length === 0 && <span className="text-xs text-white/20">No tasks</span>}
          <span className="ml-auto text-[10px] text-white/25">Click to open ↗</span>
        </div>
      </button>

      {modalOpen && (
        <DeptModal
          stage={stage}
          tasks={tasks}
          projectGid={projectGid}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

// ─── PM sidebar button ────────────────────────────────────────

function PMButton({ pm, isActive, onClick }) {
  const { name, counts } = pm;
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors border ${
        isActive
          ? 'bg-white/10 border-white/15 text-white'
          : 'bg-transparent border-transparent hover:bg-white/[0.04] text-white/70 hover:text-white/90'
      }`}
    >
      <p className="text-sm font-semibold truncate mb-1">{name}</p>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-white/50">
        {counts.urgent     > 0 && <span className="text-red-400">🚨 {counts.urgent}</span>}
        {counts.mislabeled > 0 && <span className="text-orange-400">⚠️ {counts.mislabeled}</span>}
        {counts.red        > 0 && <span className="text-red-400">🔴 {counts.red}</span>}
        {counts.yellow     > 0 && <span className="text-yellow-400">🟡 {counts.yellow}</span>}
        <span className="text-green-400">✅ {counts.green ?? 0}</span>
      </div>
    </button>
  );
}

// ─── Interactive pipeline header ──────────────────────────────

const TODAY_STR = new Date().toISOString().slice(0, 10);

/**
 * PM performance score 0–100, weighted across four signals:
 *   40% on-time rate  — jobs not past their due date
 *   35% processed rate — jobs not flagged urgent or mislabeled
 *   15% audit clean   — jobs flagged green or yellow
 *   10% avg job health — scorecard average
 */
function computePmScore(tasks, scorecardMap) {
  const total = tasks.length;
  if (total === 0) return null;

  const onTimeCount     = tasks.filter(t => t.dueOn && t.dueOn >= TODAY_STR).length;
  const unprocessed     = tasks.filter(t => t.flag === 'urgent' || t.flag === 'mislabeled').length;
  const cleanCount      = tasks.filter(t => t.flag === 'green' || t.flag === 'yellow').length;

  const onTimeRate      = onTimeCount / total;
  const processedRate   = (total - unprocessed)  / total;
  const auditCleanRate  = cleanCount             / total;

  const healthScores = tasks.map(t => scorecardMap[t.gid]?.score).filter(s => s != null);
  const avgHealth    = healthScores.length
    ? healthScores.reduce((a, b) => a + b, 0) / healthScores.length / 100
    : 0.5;

  return Math.round(
    onTimeRate     * 40 +
    processedRate  * 35 +
    auditCleanRate * 15 +
    avgHealth      * 10
  );
}

function PmPipelineHeader({ pm, scorecardMap }) {
  const [hoveredStage, setHoveredStage] = useState(null);
  const [activeStage,  setActiveStage]  = useState(null);

  const pmScore = useMemo(() => computePmScore(pm.tasks, scorecardMap), [pm.tasks, scorecardMap]);

  // Keep raw avg for reference tooltip
  const rawScores = pm.tasks.map(t => scorecardMap[t.gid]?.score).filter(s => s != null);
  const rawAvg    = rawScores.length
    ? Math.round(rawScores.reduce((a, b) => a + b, 0) / rawScores.length)
    : null;

  const stageBreakdown = useMemo(() => {
    const breakdown = {};
    for (const s of STAGES) breakdown[s.name] = [];
    breakdown['Unprocessed'] = [];
    for (const t of pm.tasks) {
      if (t.flag === 'urgent') { breakdown['Unprocessed'].push(t); continue; }
      const matched = matchStage(t.section);
      if (matched) breakdown[matched.name].push(t);
      // custom sections that don't match a pipeline stage are excluded from the bar
    }
    return breakdown;
  }, [pm.tasks]);

  const PIPELINE_STAGES = [...STAGES, { name: 'Unprocessed', color: '#ef4444' }];
  const totalStaged = PIPELINE_STAGES.reduce((sum, s) => sum + (stageBreakdown[s.name]?.length ?? 0), 0);
  const stageTasks  = activeStage ? (stageBreakdown[activeStage] ?? []) : [];

  function toggleStage(name) { setActiveStage(p => p === name ? null : name); }

  // Score breakdown for tooltip row
  const total         = pm.tasks.length;
  const lateCount     = pm.tasks.filter(t => t.dueOn && t.dueOn < TODAY_STR).length;
  const unprocessed   = pm.tasks.filter(t => t.flag === 'urgent' || t.flag === 'mislabeled').length;
  const onTimePct     = total ? Math.round(((total - lateCount)   / total) * 100) : 100;
  const processedPct  = total ? Math.round(((total - unprocessed) / total) * 100) : 100;

  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-5 space-y-5">
      {pmScore !== null && (
        <div>
          <div className="flex items-center justify-between text-sm text-white/50 mb-2">
            <span className="font-medium text-white/70">PM Performance Score</span>
            <span className="font-bold text-xl" style={{ color: healthBarColor(pmScore) }}>{pmScore}</span>
          </div>
          <div className="h-4 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pmScore}%`, backgroundColor: healthBarColor(pmScore) }} />
          </div>
          {/* Score breakdown */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-white/35">
            <span className={onTimePct < 60 ? 'text-red-400' : ''}>
              {onTimePct}% on time
            </span>
            <span className={processedPct < 70 ? 'text-orange-400' : ''}>
              {processedPct}% processed
            </span>
            {rawAvg !== null && <span>avg job health {rawAvg}</span>}
          </div>
        </div>
      )}

      {totalStaged > 0 && (
        <div>
          <p className="text-sm text-white/40 mb-3">Pipeline — click a stage to see projects</p>
          {/* Bar */}
          <div className="flex gap-1 items-end" style={{ height: '52px' }}>
            {PIPELINE_STAGES.map(stage => {
              const tasks     = stageBreakdown[stage.name] ?? [];
              if (!tasks.length) return null;
              const pct       = (tasks.length / totalStaged) * 100;
              const isHovered = hoveredStage === stage.name;
              const isActive  = activeStage === stage.name;
              return (
                <div
                  key={stage.name}
                  className="relative flex items-end justify-center cursor-pointer rounded-t-lg transition-all duration-200"
                  style={{
                    width: `${pct}%`, height: isHovered || isActive ? '52px' : '34px',
                    backgroundColor: stage.color,
                    opacity: activeStage && !isActive ? 0.35 : 1,
                    outline: isActive ? '2px solid rgba(255,255,255,0.6)' : 'none',
                    outlineOffset: '2px',
                  }}
                  onMouseEnter={() => setHoveredStage(stage.name)}
                  onMouseLeave={() => setHoveredStage(null)}
                  onClick={() => toggleStage(stage.name)}
                >
                  {(isHovered || isActive) && (
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-white whitespace-nowrap font-semibold">
                      {tasks.length}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Red count row — clean indicators aligned under each segment */}
          <div className="flex gap-1 mt-1.5">
            {PIPELINE_STAGES.map(stage => {
              const tasks    = stageBreakdown[stage.name] ?? [];
              if (!tasks.length) return null;
              const pct      = (tasks.length / totalStaged) * 100;
              const badCount = tasks.filter(t => t.flag === 'urgent' || t.flag === 'red').length;
              return (
                <div key={stage.name} style={{ width: `${pct}%` }} className="flex justify-center">
                  {badCount > 0 && (
                    <span className="text-[10px] font-semibold tabular-nums" style={{ color: '#f87171' }}>
                      {badCount} red
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
            {PIPELINE_STAGES.map(stage => {
              const count    = (stageBreakdown[stage.name] ?? []).length;
              if (!count) return null;
              const isActive = activeStage === stage.name;
              const badCount = (stageBreakdown[stage.name] ?? []).filter(t => t.flag === 'urgent' || t.flag === 'mislabeled' || t.flag === 'red').length;
              return (
                <button key={stage.name} onClick={() => toggleStage(stage.name)}
                  className={`flex items-center gap-1.5 text-sm transition-opacity ${activeStage && !isActive ? 'opacity-30' : 'opacity-100'}`}
                >
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: stage.color }} />
                  <span className={isActive ? 'text-white font-semibold' : 'text-white/60'}>{stage.name}</span>
                  <span className="text-white/30">({count})</span>
                  {badCount > 0 && (
                    <span className="text-xs text-red-400 font-semibold">· 🔴 {badCount} red</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeStage && (
        <div className="border-t border-white/5 pt-4 space-y-2">
          <p className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">
            {activeStage} · {stageTasks.length} project{stageTasks.length !== 1 ? 's' : ''}
          </p>
          <div className="grid grid-cols-[28px_1fr_90px_90px_70px_32px] gap-3 px-4 pb-1 text-xs text-white/30 uppercase tracking-wider">
            <span />
            <span>Project</span><span>Created</span><span>Due Date</span><span>Progress</span><span />
          </div>
          {stageTasks.map(task => {
            const sc          = scorecardMap[task.gid];
            const stagesDone  = (sc?.subtasks ?? []).filter(s => s.completed).length;
            return (
              <a key={task.gid} href={asanaUrl(pm.projectGid, task.gid)} target="_blank" rel="noopener noreferrer"
                className="grid grid-cols-[28px_1fr_90px_90px_70px_32px] gap-3 items-center bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 hover:border-white/15 rounded-xl px-4 py-3 transition-colors group"
              >
                <span className="text-base text-center">{FLAG_META[task.flag]?.emoji ?? '⬜'}</span>
                <span className="text-sm text-white/90 truncate group-hover:text-white">{task.name}</span>
                <span className="text-xs text-white/40 tabular-nums">{task.createdAt ? formatDate(task.createdAt) : '—'}</span>
                <span className={`text-xs tabular-nums ${task.dueOn && task.dueOn < new Date().toISOString().slice(0,10) ? 'text-red-400 font-semibold' : 'text-white/40'}`}>
                  {task.dueOn ? formatDate(task.dueOn) : '—'}
                </span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: healthBarColor((stagesDone / 5) * 100) }}>
                  {stagesDone}/5
                </span>
                <span className="text-white/20 group-hover:text-white/50 text-sm text-right">↗</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main tab ─────────────────────────────────────────────────

export default function AuditTab({ data, scorecards, selectedPm, onSelectPm }) {
  const scorecardMap = useMemo(() => {
    const map = {};
    for (const sc of scorecards ?? []) map[sc.gid] = sc;
    return map;
  }, [scorecards]);

  if (!data || !Array.isArray(data.pms) || data.pms.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/30 text-sm">Audit data unavailable</p>
      </div>
    );
  }

  const defaultPm = useMemo(() => {
    return data.pms.reduce((best, pm) => {
      const score     = (pm.counts?.urgent ?? 0) + (pm.counts?.red ?? 0);
      const bestScore = (best?.counts?.urgent ?? 0) + (best?.counts?.red ?? 0);
      return score > bestScore ? pm : best;
    }, data.pms[0]);
  }, [data.pms]);

  const activePmName = selectedPm ?? defaultPm?.name ?? null;
  const activePm     = data.pms.find(p => p.name === activePmName) ?? null;

  if (!activePm) {
    return (
      <div className="flex gap-4">
        <div className="w-48 shrink-0 space-y-1">
          {data.pms.map(pm => (
            <PMButton key={pm.name} pm={pm} isActive={false} onClick={() => onSelectPm(pm.name)} />
          ))}
        </div>
        <div className="flex-1 flex items-center justify-center h-48">
          <p className="text-white/30 text-sm">Select a PM to view their report</p>
        </div>
      </div>
    );
  }

  const tasksByDept = useMemo(() => {
    const groups = {};
    for (const s of STAGES) groups[s.name] = [];
    groups['Unprocessed'] = [];
    groups['Mislabeled']  = [];
    (activePm.tasks ?? []).forEach(t => {
      if (t.flag === 'urgent')     { groups['Unprocessed'].push(t); return; }
      if (t.flag === 'mislabeled') { groups['Mislabeled'].push(t);  return; }
      const matched = matchStage(t.section);
      // Normalize section name: collapse spaces around punctuation and trim
      const rawKey  = matched?.name ?? (t.section ? t.section.replace(/\s*([\/,\-])\s*/g, '$1').trim() : 'Other');
      const key     = rawKey || 'Other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  }, [activePm]);

  const { counts } = activePm;

  return (
    <div className="flex gap-4 items-start">
      {/* Left: PM list */}
      <div className="w-48 shrink-0 bg-slate-card border border-white/5 rounded-2xl p-2 space-y-0.5">
        <p className="text-xs uppercase tracking-wider text-white/30 px-2 pt-1 pb-0.5">Project Managers</p>
        {data.pms.map(pm => (
          <PMButton key={pm.name} pm={pm} isActive={pm.name === activePmName} onClick={() => onSelectPm(pm.name)} />
        ))}
        {data.generatedAt && (
          <p className="text-[10px] text-white/20 px-2 pt-2 pb-1">Generated {formatDate(data.generatedAt)}</p>
        )}
      </div>

      {/* Right: PM report */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Summary header */}
        <div className="bg-slate-card border border-white/5 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold">{activePm.name}</h2>
              <p className="text-white/40 text-sm mt-0.5">{(activePm.tasks ?? []).length} active jobs</p>
            </div>
            <div className="flex gap-4 text-base flex-wrap">
              {counts.urgent     > 0 && <span className="flex items-center gap-1.5 text-red-400 font-semibold">🚨 <span>{counts.urgent} unprocessed</span></span>}
              {counts.mislabeled > 0 && <span className="flex items-center gap-1.5 text-orange-400 font-semibold">⚠️ <span>{counts.mislabeled} mislabeled</span></span>}
              {counts.red        > 0 && <span className="flex items-center gap-1.5 text-red-400 font-semibold">🔴 <span>{counts.red} red</span></span>}
              {counts.yellow     > 0 && <span className="flex items-center gap-1.5 text-yellow-400 font-semibold">🟡 <span>{counts.yellow} yellow</span></span>}
              <span className="flex items-center gap-1.5 text-green-400 font-semibold">✅ <span>{counts.green ?? 0} clear</span></span>
            </div>
          </div>
        </div>

        {/* Health + Pipeline */}
        <PmPipelineHeader pm={activePm} scorecardMap={scorecardMap} />

        {/* Department sections — 3 per row */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Known pipeline stages */}
          {STAGES.map(stage => {
            const tasks = tasksByDept[stage.name] ?? [];
            if (!tasks.length) return null;
            return (
              <DeptSection key={stage.name} stage={stage} tasks={tasks} projectGid={activePm.projectGid} />
            );
          })}
          {/* Custom sections that don't match a pipeline stage */}
          {Object.entries(tasksByDept)
            .filter(([key]) => !STAGES.some(s => s.name === key) && key !== 'Unprocessed' && key !== 'Mislabeled' && key !== 'Other')
            .map(([key, tasks]) => tasks.length > 0 && (
              <DeptSection key={key} stage={{ name: key, color: '#6b7280' }} tasks={tasks} projectGid={activePm.projectGid} />
            ))}
          {/* Mislabeled — in untitled section but work has been done */}
          {(tasksByDept['Mislabeled'] ?? []).length > 0 && (
            <DeptSection
              stage={{ name: 'Mislabeled', color: '#f97316' }}
              tasks={tasksByDept['Mislabeled']}
              projectGid={activePm.projectGid}
            />
          )}
          {/* Truly unprocessed — untitled section, no work done */}
          {(tasksByDept['Unprocessed'] ?? []).length > 0 && (
            <DeptSection
              stage={{ name: 'Unprocessed', color: '#ef4444' }}
              tasks={tasksByDept['Unprocessed']}
              projectGid={activePm.projectGid}
            />
          )}
        </div>

        {(activePm.tasks ?? []).length === 0 && (
          <div className="bg-slate-card border border-white/5 rounded-2xl p-8 text-center">
            <p className="text-white/30 text-sm">No flagged tasks for {activePm.name}</p>
          </div>
        )}
      </div>
    </div>
  );
}
