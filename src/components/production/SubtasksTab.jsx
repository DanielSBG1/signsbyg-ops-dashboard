import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';

// ─── Team roster (display order) ─────────────────────────────
const TEAM_ROSTER = [
  { key: 'Manuel Munoz',                 display: 'Manuel Munoz' },
  { key: 'Fernando Peña',                display: 'Fernando Peña' },
  { key: 'Ivan Acevedo',                 display: 'Ivan Acevedo' },
  { key: 'jose@signsbyghouston.com',     display: 'Jose' },
  { key: 'Eduardo Menchu',               display: 'Eduardo Menchu' },
  { key: 'Marlon Castillo',              display: 'Marlon Castillo' },
];

const TEAM_KEYS = new Set(TEAM_ROSTER.map(m => m.key));

function resolveAssignee(assignee) {
  if (!assignee) return { key: '__unassigned__', display: 'Unassigned' };
  const name = assignee.name || assignee.email || assignee;
  const match = TEAM_ROSTER.find(
    m => m.key === name || m.key.toLowerCase() === String(name).toLowerCase(),
  );
  if (match) return match;
  if (TEAM_KEYS.has(name)) return { key: name, display: name };
  return { key: '__other__', display: 'Other' };
}

// ─── Date helpers ────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Status helpers ─────────────────────────────────────────
function getStatusKey(subtask, today) {
  if (subtask.completed) {
    const isOnTime = subtask.due_on && subtask.completed_at
      && subtask.completed_at.slice(0, 10) <= subtask.due_on;
    return isOnTime ? 'on_time' : 'late';
  }
  if (subtask.due_on && subtask.due_on < today) return 'overdue';
  if (subtask.due_on) return 'in_progress';
  return 'no_date';
}

const STATUS_ORDER = { overdue: 0, late: 1, in_progress: 2, on_time: 3, no_date: 4 };

// ─── Compute per-member stats ────────────────────────────────
function computeMemberStats(subtasks, today) {
  const total     = subtasks.length;
  const completed = subtasks.filter(s => s.completed);
  const open      = subtasks.filter(s => !s.completed);

  const onTime = completed.filter(s => {
    if (!s.due_on || !s.completed_at) return false;
    return s.completed_at.slice(0, 10) <= s.due_on;
  });

  const late = completed.filter(s => {
    if (!s.due_on) return true;
    if (!s.completed_at) return true;
    return s.completed_at.slice(0, 10) > s.due_on;
  });

  const overdue = open.filter(s => s.due_on && s.due_on < today);

  const onTimeRate = completed.length > 0
    ? Math.round((onTime.length / completed.length) * 100)
    : 0;

  return {
    total,
    completed: completed.length,
    onTime:    onTime.length,
    late:      late.length,
    open:      open.length,
    overdue:   overdue.length,
    onTimeRate,
    subtasks,
  };
}

// ─── Status badge ────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    on_time:     { label: 'On Time',     cls: 'bg-success/20 text-success' },
    late:        { label: 'Late',        cls: 'bg-danger/20 text-danger' },
    overdue:     { label: 'Overdue',     cls: 'bg-danger/20 text-danger' },
    in_progress: { label: 'In Progress', cls: 'bg-accent/20 text-accent' },
    no_date:     { label: 'No Date',     cls: 'bg-white/10 text-white/40' },
  }[status] || { label: status, cls: 'bg-white/10 text-white/40' };

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ─── Rate color helper ───────────────────────────────────────
function rateColorClass(rate) {
  if (rate >= 80) return 'text-success';
  if (rate >= 50) return 'text-warning';
  return 'text-danger';
}

// ─── Sortable column header ─────────────────────────────────
function SortHeader({ label, sortKey, currentSort, currentDir, onSort, className }) {
  const isActive = currentSort === sortKey;
  const arrow = isActive ? (currentDir === 'asc' ? ' ↑' : ' ↓') : '';
  return (
    <span
      className={`cursor-pointer select-none hover:text-white/60 transition-colors ${isActive ? 'text-accent' : ''} ${className || ''}`}
      onClick={() => onSort(sortKey)}
    >
      {label}{arrow}
    </span>
  );
}

// ─── Score Card (clickable) ──────────────────────────────────
function ScoreCard({ member, active, onClick }) {
  const barTotal = member.onTime + member.late;
  const onTimePct = barTotal > 0 ? Math.round((member.onTime / barTotal) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className={`bg-white/5 rounded-xl p-4 text-center min-w-[140px] flex-shrink-0 transition-all ${
        active ? 'ring-1 ring-accent/50 bg-accent/5' : 'hover:bg-white/[0.07]'
      }`}
    >
      <p className="text-xs font-semibold text-white/70 truncate mb-1">{member.display}</p>
      <p className={`text-2xl font-bold tabular-nums ${rateColorClass(member.onTimeRate)}`}>
        {member.onTimeRate}%
      </p>
      <p className="text-[10px] text-white/30 mb-2">
        {member.completed}/{member.total} done
      </p>
      <div className="h-1.5 rounded-full overflow-hidden flex bg-white/5">
        {barTotal === 0 ? (
          <div className="flex-1" />
        ) : (
          <>
            {member.onTime > 0 && (
              <div className="bg-success/70 transition-all" style={{ width: `${onTimePct}%` }} />
            )}
            {member.late > 0 && (
              <div className="bg-danger/70 transition-all" style={{ width: `${100 - onTimePct}%` }} />
            )}
          </>
        )}
      </div>
      <div className="flex justify-center gap-2 mt-1 text-[9px] text-white/30">
        <span>{member.onTime} on-time</span>
        <span>{member.late} late</span>
      </div>
    </button>
  );
}

// ─── Member Section (sortable columns) ──────────────────────
function MemberSection({ member, expanded, onToggle, today, sectionRef }) {
  const [sortKey, setSortKey] = useState('due_on');
  const [sortDir, setSortDir] = useState('asc');

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'asc');
    }
  }

  const sortedTasks = useMemo(() => {
    const tasks = [...member.subtasks];
    tasks.sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case 'name':
          av = (a.name || '').toLowerCase();
          bv = (b.name || '').toLowerCase();
          return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'due_on':
          av = a.due_on || '9999';
          bv = b.due_on || '9999';
          return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'status':
          av = STATUS_ORDER[getStatusKey(a, today)] ?? 4;
          bv = STATUS_ORDER[getStatusKey(b, today)] ?? 4;
          return sortDir === 'asc' ? av - bv : bv - av;
        case 'completed_at':
          av = a.completed_at || '9999';
          bv = b.completed_at || '9999';
          return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        default:
          return 0;
      }
    });
    return tasks;
  }, [member.subtasks, sortKey, sortDir, today]);

  return (
    <div ref={sectionRef} className="bg-white/[0.03] rounded-xl overflow-hidden">
      <button
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/[0.05] transition-colors text-left"
        onClick={onToggle}
      >
        <span className="text-sm font-semibold text-white/90 shrink-0">{member.display}</span>
        {member.open > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-bold shrink-0">
            {member.open} open
          </span>
        )}
        {member.overdue > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/20 text-danger font-bold shrink-0">
            {member.overdue} overdue
          </span>
        )}
        <span className="flex-1" />
        <span className={`text-xs font-semibold tabular-nums ${rateColorClass(member.onTimeRate)}`}>
          {member.onTimeRate}%
        </span>
        <span className="shrink-0 text-white/30 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-white/5">
          <div className="px-4 py-2 grid grid-cols-[1fr_80px_80px_90px] gap-2 text-[10px] uppercase tracking-wider text-white/40">
            <SortHeader label="Task" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortHeader label="Due" sortKey="due_on" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortHeader label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortHeader label="Completed" sortKey="completed_at" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          </div>

          {sortedTasks.map((st, idx) => (
            <div
              key={st.gid || idx}
              className="px-4 py-2 grid grid-cols-[1fr_80px_80px_90px] gap-2 items-center border-t border-white/[0.03] hover:bg-white/[0.03] transition-colors"
            >
              <span className="text-xs text-white/80 truncate" title={st.name}>
                {st._parentName && (
                  <span className="text-white/30 mr-1">{st._parentName} /</span>
                )}
                {st.name}
              </span>
              <span className="text-xs tabular-nums text-white/50">{fmtDate(st.due_on)}</span>
              <StatusBadge status={getStatusKey(st, today)} />
              <span className="text-xs tabular-nums text-white/40">
                {st.completed_at ? fmtDate(st.completed_at.slice(0, 10)) : '—'}
              </span>
            </div>
          ))}

          {sortedTasks.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-white/20">No subtasks</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────
export default function SubtasksTab({ data }) {
  const today = useMemo(() => todayStr(), []);

  const members = useMemo(() => {
    if (!data?.jobs) return [];

    const allSubtasks = data.jobs.flatMap(job =>
      (job.subTasks || []).map(st => ({ ...st, _parentName: job.name })),
    );

    const grouped = {};
    for (const st of allSubtasks) {
      const { key, display } = resolveAssignee(st.assignee);
      if (!grouped[key]) grouped[key] = { key, display, subtasks: [] };
      grouped[key].subtasks.push(st);
    }

    const result = Object.values(grouped).map(g => ({
      ...g,
      ...computeMemberStats(g.subtasks, today),
    }));

    const rosterOrder = TEAM_ROSTER.map(m => m.key);
    const roster = rosterOrder
      .map(k => result.find(r => r.key === k))
      .filter(Boolean)
      .sort((a, b) => b.onTimeRate - a.onTimeRate);

    const other = result.find(r => r.key === '__other__');
    const unassigned = result.find(r => r.key === '__unassigned__');

    return [...roster, ...(other ? [other] : []), ...(unassigned ? [unassigned] : [])];
  }, [data, today]);

  const [expandedKeys, setExpandedKeys] = useState(() => {
    const initial = new Set();
    members.slice(0, 3).forEach(m => initial.add(m.key));
    return initial;
  });

  // Refs for scrolling to sections when score card is clicked
  const sectionRefs = useRef({});
  const [scrollTarget, setScrollTarget] = useState(null);

  useEffect(() => {
    if (scrollTarget && sectionRefs.current[scrollTarget]) {
      sectionRefs.current[scrollTarget].scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollTarget(null);
    }
  }, [scrollTarget, expandedKeys]);

  const handleScoreCardClick = useCallback((key) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        setScrollTarget(key);
      }
      return next;
    });
  }, []);

  const toggleSection = useCallback((key) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (!data) {
    return <div className="text-center py-20 text-white/30 text-sm">Loading subtask data...</div>;
  }

  if (members.length === 0) {
    return <div className="text-center py-20 text-white/30 text-sm">No subtask data available.</div>;
  }

  return (
    <div className="space-y-6">
      {/* ── Scoreboard (clickable) ─────────────────────────── */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-white/40 mb-3">On-Time Completion — click to jump to member</p>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {members.map(m => (
            <ScoreCard
              key={m.key}
              member={m}
              active={expandedKeys.has(m.key)}
              onClick={() => handleScoreCardClick(m.key)}
            />
          ))}
        </div>
      </div>

      {/* ── Team member sections (sortable columns) ────────── */}
      <div className="space-y-3">
        {members.map(m => (
          <MemberSection
            key={m.key}
            member={m}
            expanded={expandedKeys.has(m.key)}
            onToggle={() => toggleSection(m.key)}
            today={today}
            sectionRef={el => { sectionRefs.current[m.key] = el; }}
          />
        ))}
      </div>
    </div>
  );
}
