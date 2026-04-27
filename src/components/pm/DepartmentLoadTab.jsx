import React, { useState, useMemo, useEffect } from 'react';

const DEPT_ORDER = ['design', 'permitting', 'production', 'installation', 'invoicing'];

const DEPT_META = {
  design:       { label: 'Design',       color: '#3b82f6', icon: '✏️' },
  permitting:   { label: 'Permitting',   color: '#a855f7', icon: '📋' },
  production:   { label: 'Production',   color: '#f97316', icon: '🏭' },
  installation: { label: 'Installation', color: '#eab308', icon: '🔧' },
  invoicing:    { label: 'Invoicing',    color: '#22c55e', icon: '🧾' },
};

const TODAY = new Date().toISOString().slice(0, 10);
const WEEK_OUT = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

// ─── Health scoring ────────────────────────────────────────────

function computeHealth(tasks) {
  const total = tasks.length;
  if (total === 0) return { score: 100, status: 'green', label: 'Open Capacity', overdueCount: 0, noDateCount: 0, redoCount: 0, dueSoonCount: 0 };

  const overdueCount  = tasks.filter(t => t.due_on && t.due_on < TODAY).length;
  const noDateCount   = tasks.filter(t => !t.due_on).length;
  const redoCount     = tasks.filter(t => t.isRedo).length;
  const dueSoonCount  = tasks.filter(t => t.due_on && t.due_on >= TODAY && t.due_on <= WEEK_OUT).length;

  let score = 100;

  // Overdue is the heaviest signal — each overdue job as % of queue
  const overdueRatio = overdueCount / total;
  score -= overdueRatio * 55;

  // Missing due dates indicate mismanagement
  const noDateRatio = noDateCount / total;
  score -= noDateRatio * 25;

  // REDO jobs add extra load
  const redoRatio = redoCount / total;
  score -= redoRatio * 20;

  // Hard caps for absolute overdue counts
  if (overdueCount >= 3) score = Math.min(score, 60);
  if (overdueCount >= 6) score = Math.min(score, 35);

  score = Math.max(0, Math.min(100, Math.round(score)));

  let status, label;
  if (score >= 70)      { status = 'green';  label = 'Open Capacity'; }
  else if (score >= 45) { status = 'yellow'; label = 'Watch'; }
  else                  { status = 'red';    label = 'At Capacity'; }

  return { score, status, label, overdueCount, noDateCount, redoCount, dueSoonCount };
}

// ─── Color helpers ─────────────────────────────────────────────

function healthColor(score) {
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

const STATUS_STYLES = {
  green:  { border: 'border-green-500/30',  bg: 'bg-green-500/10',  text: 'text-green-400',  badge: 'bg-green-500/20 text-green-300 border-green-500/40' },
  yellow: { border: 'border-yellow-500/30', bg: 'bg-yellow-500/10', text: 'text-yellow-400', badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
  red:    { border: 'border-red-500/30',    bg: 'bg-red-500/10',    text: 'text-red-400',    badge: 'bg-red-500/20 text-red-300 border-red-500/40' },
};

function formatDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return d; }
}

// ─── Task list panel (shown when a section is clicked) ─────────

function TaskListPanel({ sectionName, tasks, onJobClick, onBack }) {
  const SORT_COLS = [
    { key: 'name',   label: 'Job' },
    { key: 'due_on', label: 'Due Date' },
    { key: 'status', label: 'Status' },
  ];
  const [sortCol, setSortCol] = useState('status');
  const [sortDir, setSortDir] = useState('asc');

  function sortVal(t, col) {
    if (col === 'name')   return (t.name ?? '').toLowerCase();
    if (col === 'due_on') return t.due_on ?? '9999-99-99';
    if (col === 'status') {
      if (t.isRedo)                         return 0;
      if (t.due_on && t.due_on < TODAY)     return 1;
      if (t.due_on && t.due_on <= WEEK_OUT) return 2;
      if (!t.due_on)                        return 3;
      return 4;
    }
    return '';
  }

  function handleCol(key) {
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(key); setSortDir('asc'); }
  }

  const sorted = [...tasks].sort((a, b) => {
    const av = sortVal(a, sortCol), bv = sortVal(b, sortCol);
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Back bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/5 flex-shrink-0 bg-white/[0.02]">
        <button onClick={onBack} className="text-white/40 hover:text-white text-sm flex items-center gap-1.5 transition-colors">
          ← Back
        </button>
        <span className="text-sm font-semibold text-white">{sectionName}</span>
        <span className="text-xs text-white/40">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_110px_120px] gap-4 px-6 py-3 border-b border-white/5 bg-white/[0.015] flex-shrink-0">
        {SORT_COLS.map(col => (
          <button key={col.key} onClick={() => handleCol(col.key)}
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
        {sorted.map(t => {
          const isOverdue = t.due_on && t.due_on < TODAY;
          const isSoon    = t.due_on && !isOverdue && t.due_on <= WEEK_OUT;
          const noDate    = !t.due_on;
          return (
            <div key={t.gid}
              className="grid grid-cols-[1fr_110px_120px] gap-4 items-center px-6 py-3.5 hover:bg-white/[0.04] cursor-pointer transition-colors group"
              onClick={() => onJobClick(t.parentGid || t.gid)}
            >
              <span className="text-sm text-white/85 truncate group-hover:text-white" title={t.name}>
                {t.name.replace(/^(DESIGN|PERMITTING|PRODUCTION|INSTALLATION|INVOICING)\s*[-–]\s*/i, '')}
              </span>
              <span className={`text-sm tabular-nums ${isOverdue ? 'text-red-400 font-semibold' : isSoon ? 'text-yellow-400' : noDate ? 'text-white/25' : 'text-white/50'}`}>
                {noDate ? '—' : formatDate(t.due_on)}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {t.isRedo   && <span className="text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30 px-1.5 py-0.5 rounded-full font-bold">REDO</span>}
                {isOverdue  && <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded-full">Late</span>}
                {isSoon     && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full">Due soon</span>}
                {noDate     && <span className="text-[10px] bg-white/5 text-white/30 border border-white/10 px-1.5 py-0.5 rounded-full">No date</span>}
                {!isOverdue && !isSoon && !noDate && !t.isRedo && (
                  <span className="text-[10px] text-green-400/60">On time</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Department modal: sections overview + drill-down ──────────

const SECTION_COLS = [
  { key: 'name',    label: 'Section',   align: 'left' },
  { key: 'total',   label: 'Tasks',     align: 'center' },
  { key: 'onTime',  label: 'On Time',   align: 'center' },
  { key: 'late',    label: 'Late',      align: 'center' },
  { key: 'noDate',  label: 'No Date',   align: 'center' },
];

function TaskModal({ meta, health, tasks, sectionOrder, onJobClick, onClose }) {
  const [activeSection, setActiveSection] = useState(null);
  const [sortCol, setSortCol] = useState(null); // null = Asana order
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') { if (activeSection) setActiveSection(null); else onClose(); } }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, activeSection]);

  function handleCol(key) {
    if (sortCol === key) {
      if (sortDir === 'desc') { setSortCol(null); } // third click resets to Asana order
      else setSortDir('desc');
    } else {
      setSortCol(key);
      setSortDir('desc');
    }
  }

  // Build section stats
  const sectionMap = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      const key = t.section || '(No Section)';
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [tasks]);

  const sections = useMemo(() => {
    const built = Object.entries(sectionMap).map(([name, sectionTasks]) => ({
      name,
      tasks: sectionTasks,
      total:        sectionTasks.length,
      lateCount:    sectionTasks.filter(t => t.due_on && t.due_on < TODAY).length,
      onTimeCount:  sectionTasks.filter(t => t.due_on && t.due_on >= TODAY).length,
      noDateCount:  sectionTasks.filter(t => !t.due_on).length,
    }));

    if (!sortCol) {
      // Preserve Asana section order; unseen sections go to the end
      const order = sectionOrder ?? [];
      return [...built].sort((a, b) => {
        const ai = order.indexOf(a.name);
        const bi = order.indexOf(b.name);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    }

    return [...built].sort((a, b) => {
      let av, bv;
      if (sortCol === 'name')   { av = a.name.toLowerCase();  bv = b.name.toLowerCase(); }
      if (sortCol === 'total')  { av = a.total;               bv = b.total; }
      if (sortCol === 'onTime') { av = a.onTimeCount;         bv = b.onTimeCount; }
      if (sortCol === 'late')   { av = a.lateCount;           bv = b.lateCount; }
      if (sortCol === 'noDate') { av = a.noDateCount;         bv = b.noDateCount; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });
  }, [sectionMap, sectionOrder, sortCol, sortDir]);

  const ss = STATUS_STYLES[health.status];
  const activeSectionData = sections.find(s => s.name === activeSection);

  return (
    <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1e1e30] border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Modal header — always visible */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-shrink-0"
          style={{ backgroundColor: `${meta.color}18` }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{meta.icon}</span>
            <div>
              <span className="text-lg font-bold text-white">{meta.label}</span>
              <div className="flex items-center gap-3 mt-0.5">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${ss.badge}`}>{health.label}</span>
                <span className="text-xs text-white/40">{tasks.length} tasks · {sections.length} section{sections.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/80 text-2xl leading-none">×</button>
        </div>

        {/* Body: sections list or task drill-down */}
        {!activeSection ? (
          <div className="overflow-y-auto flex-1 flex flex-col">
            {/* Sortable column headers */}
            <div className="grid grid-cols-[1fr_70px_70px_70px_70px] gap-3 px-6 py-3 border-b border-white/5 bg-white/[0.02] flex-shrink-0">
              {SECTION_COLS.map(col => (
                <button
                  key={col.key}
                  onClick={() => handleCol(col.key)}
                  className={`text-xs uppercase tracking-wider font-semibold flex items-center gap-1 transition-colors
                    ${col.align === 'center' ? 'justify-center' : ''}
                    ${sortCol === col.key ? 'text-yellow-300' : 'text-white/35 hover:text-white/65'}`}
                >
                  {col.label}
                  {sortCol === col.key
                    ? <span className="text-[10px]">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    : null}
                </button>
              ))}
            </div>

            <div className="divide-y divide-white/[0.04]">
              {sections.map(sec => {
                const hasLate = sec.lateCount > 0;
                return (
                  <button key={sec.name}
                    className="w-full grid grid-cols-[1fr_70px_70px_70px_70px] gap-3 items-center px-6 py-4 hover:bg-white/[0.04] transition-colors text-left group"
                    onClick={() => setActiveSection(sec.name)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasLate ? 'bg-red-400' : 'bg-green-400/50'}`} />
                      <span className="text-sm text-white/85 group-hover:text-white truncate font-medium">{sec.name}</span>
                    </div>
                    <span className="text-sm tabular-nums text-center text-white/50">{sec.total}</span>
                    <span className={`text-sm tabular-nums text-center font-semibold ${sec.onTimeCount > 0 ? 'text-green-400' : 'text-white/20'}`}>
                      {sec.onTimeCount}
                    </span>
                    <span className={`text-sm tabular-nums text-center font-semibold ${hasLate ? 'text-red-400' : 'text-white/20'}`}>
                      {sec.lateCount}
                    </span>
                    <span className={`text-sm tabular-nums text-center font-semibold ${sec.noDateCount > 0 ? 'text-white/45' : 'text-white/20'}`}>
                      {sec.noDateCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <TaskListPanel
            sectionName={activeSection}
            tasks={activeSectionData?.tasks ?? []}
            onJobClick={(gid) => { onJobClick(gid); onClose(); }}
            onBack={() => setActiveSection(null)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Department module card ────────────────────────────────────

function DeptModule({ deptKey, dept, onJobClick }) {
  const [modalOpen, setModalOpen] = useState(false);

  const meta   = DEPT_META[deptKey];
  const health = useMemo(() => computeHealth(dept.tasks), [dept.tasks]);
  const ss     = STATUS_STYLES[health.status];

  const statItems = [
    health.overdueCount > 0  && { label: 'Overdue',      value: health.overdueCount,  color: 'text-red-400',    bg: 'bg-red-500/10' },
    health.noDateCount > 0   && { label: 'Missing date',  value: health.noDateCount,   color: 'text-white/40',   bg: 'bg-white/5' },
    health.redoCount > 0     && { label: 'REDO',          value: health.redoCount,     color: 'text-orange-400', bg: 'bg-orange-500/10' },
    health.dueSoonCount > 0  && { label: 'Due this week', value: health.dueSoonCount,  color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  ].filter(Boolean);

  return (
    <>
      <button
        className={`w-full text-left rounded-2xl border ${ss.border} bg-slate-card transition-all hover:brightness-110 hover:border-white/20 flex flex-col overflow-hidden`}
        onClick={() => setModalOpen(true)}
      >
        {/* Colored top bar */}
        <div className="h-1.5 w-full" style={{ backgroundColor: meta.color }} />

        <div className="p-6 flex flex-col gap-5 flex-1">
          {/* Dept name + status badge */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none">{meta.icon}</span>
              <div>
                <p className="text-xl font-bold text-white">{meta.label}</p>
                {dept.lead && <p className="text-xs text-white/35 mt-0.5">{dept.lead}</p>}
              </div>
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full border flex-shrink-0 ${ss.badge}`}>
              {health.label}
            </span>
          </div>

          {/* Big task count */}
          <div className="flex items-end gap-2">
            <span className="text-5xl font-black tabular-nums leading-none" style={{ color: healthColor(health.score) }}>
              {dept.tasks.length}
            </span>
            <span className="text-sm text-white/40 mb-1">active tasks</span>
          </div>

          {/* Health bar */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-white/40">Department Health</span>
              <span className="font-bold tabular-nums" style={{ color: healthColor(health.score) }}>{health.score}</span>
            </div>
            <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${health.score}%`, backgroundColor: healthColor(health.score) }}
              />
            </div>
          </div>

          {/* Issue breakdown pills */}
          {statItems.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {statItems.map((item, i) => (
                <div key={i} className={`flex items-center gap-1.5 ${item.bg} rounded-lg px-3 py-1.5`}>
                  <span className={`text-xl font-black tabular-nums leading-none ${item.color}`}>{item.value}</span>
                  <span className="text-xs text-white/50">{item.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-green-400/70">All tasks on track — no issues flagged</div>
          )}

          <div className="text-[11px] text-white/25 mt-auto pt-1">Click to view all tasks ↗</div>
        </div>
      </button>

      {modalOpen && (
        <TaskModal
          meta={meta}
          health={health}
          tasks={dept.tasks}
          sectionOrder={dept.sectionOrder}
          onJobClick={onJobClick}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

// ─── Tab ───────────────────────────────────────────────────────

export default function DepartmentLoadTab({ data, onJobClick }) {
  const { departmentLoad } = data;

  const depts = DEPT_ORDER.map(key => ({ key, dept: departmentLoad[key] })).filter(d => d.dept);

  // Overall summary across all depts
  const allTasks     = depts.flatMap(d => d.dept.tasks);
  const totalOverdue = allTasks.filter(t => t.due_on && t.due_on < TODAY).length;
  const totalNoDate  = allTasks.filter(t => !t.due_on).length;
  const totalRedo    = allTasks.filter(t => t.isRedo).length;
  const atCapacity   = depts.filter(d => computeHealth(d.dept.tasks).status === 'red').length;
  const onTrack      = depts.filter(d => computeHealth(d.dept.tasks).status === 'green').length;

  return (
    <div className="space-y-6">
      {/* Page title + summary strip */}
      <div>
        <h2 className="text-lg font-semibold">Department Load</h2>
        <p className="text-white/40 text-xs mt-0.5">Capacity and health per department — click a module to view tasks</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-card border border-white/5 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{allTasks.length}</p>
          <p className="text-[10px] text-white/40 uppercase tracking-wider mt-1">Total Active</p>
        </div>
        <div className={`bg-slate-card border rounded-xl p-4 text-center ${atCapacity > 0 ? 'border-red-500/20' : 'border-white/5'}`}>
          <p className={`text-2xl font-bold ${atCapacity > 0 ? 'text-red-400' : 'text-white/30'}`}>{atCapacity}</p>
          <p className="text-[10px] text-white/40 uppercase tracking-wider mt-1">At Capacity</p>
        </div>
        <div className={`bg-slate-card border rounded-xl p-4 text-center ${totalOverdue > 0 ? 'border-red-500/20' : 'border-white/5'}`}>
          <p className={`text-2xl font-bold ${totalOverdue > 0 ? 'text-red-400' : 'text-white/30'}`}>{totalOverdue}</p>
          <p className="text-[10px] text-white/40 uppercase tracking-wider mt-1">Overdue Tasks</p>
        </div>
        <div className={`bg-slate-card border rounded-xl p-4 text-center ${onTrack > 0 ? 'border-green-500/20' : 'border-white/5'}`}>
          <p className={`text-2xl font-bold ${onTrack > 0 ? 'text-green-400' : 'text-white/30'}`}>{onTrack}</p>
          <p className="text-[10px] text-white/40 uppercase tracking-wider mt-1">Open Capacity</p>
        </div>
      </div>

      {/* Department modules — 2 per row on large screens */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {depts.map(({ key, dept }) => (
          <DeptModule key={key} deptKey={key} dept={dept} onJobClick={onJobClick} />
        ))}
      </div>
    </div>
  );
}
