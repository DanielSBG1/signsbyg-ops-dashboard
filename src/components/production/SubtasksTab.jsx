import React, { useState, useMemo, useCallback, useRef, useEffect, lazy, Suspense } from 'react';

const TeamMemberProfile = lazy(() => import('./TeamMemberProfile'));

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

  // On-time rate includes overdue open tasks as failures — having overdue
  // tasks should bring down your score, not be invisible.
  const denominator = completed.length + overdue.length;
  const onTimeRate = denominator > 0
    ? Math.round((onTime.length / denominator) * 100)
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

// ─── Leaderboard sort options ────────────────────────────────
const LEADERBOARD_SORTS = [
  { key: 'onTimeRate',  label: 'On-Time %' },
  { key: 'completed',   label: 'Completed' },
  { key: 'open',        label: 'Open' },
  { key: 'overdue',     label: 'Overdue', ascending: false },
  { key: 'onTime',      label: 'On Time' },
  { key: 'late',        label: 'Late', ascending: false },
  { key: 'total',       label: 'Total' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

function leaderboardBarColor(member) {
  if (member.onTimeRate >= 80) return 'bg-success';
  if (member.onTimeRate >= 50) return 'bg-warning';
  return 'bg-danger';
}

function fmtLeaderboardValue(member, key) {
  if (key === 'onTimeRate') return `${member[key]}%`;
  return member[key] ?? 0;
}

// ─── Leaderboard Component ───────────────────────────────────
function ProductionLeaderboard({ members, sortKey, onSortChange, onViewProfile, onMemberClick }) {
  const sortOpt = LEADERBOARD_SORTS.find(o => o.key === sortKey);

  const sorted = useMemo(() => {
    return [...members].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return sortOpt?.ascending === false ? av - bv : bv - av;
    });
  }, [members, sortKey, sortOpt]);

  const maxVal = Math.max(...sorted.map(m => m[sortKey] ?? 0), 1);

  if (sorted.length === 0) return null;

  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
      {/* Header + sort pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold">Production Team Leaderboard</h2>
        <div className="flex items-center gap-1.5">
          <span className="text-white/30 text-xs mr-1">Sort:</span>
          {LEADERBOARD_SORTS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onSortChange(opt.key)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                sortKey === opt.key
                  ? 'bg-accent text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Podium — top 3 */}
      {sorted.length >= 3 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          {sorted.slice(0, 3).map((m, idx) => (
            <div
              key={m.key}
              className="bg-white/[0.05] rounded-xl p-4 text-center cursor-pointer hover:bg-white/[0.08] transition-colors"
              onClick={() => onMemberClick(m.key)}
            >
              <span className="text-2xl">{MEDALS[idx]}</span>
              <p className="text-sm font-semibold text-white mt-1 truncate">{m.display}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${rateColorClass(m.onTimeRate)}`}>
                {fmtLeaderboardValue(m, sortKey)}
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[10px]">
                <div><span className="text-white/30">Done</span> <span className="text-white/60">{m.completed}</span></div>
                <div><span className="text-white/30">Open</span> <span className="text-white/60">{m.open}</span></div>
                <div><span className="text-white/30">On Time</span> <span className="text-success/70">{m.onTime}</span></div>
                <div><span className="text-white/30">Late</span> <span className="text-danger/70">{m.late}</span></div>
                {m.overdue > 0 && (
                  <div className="col-span-2"><span className="text-white/30">Overdue</span> <span className="text-danger">{m.overdue}</span> <span className="text-white/20">— counts against rate</span></div>
                )}
              </div>
              <button
                className="text-[10px] text-accent hover:underline mt-2"
                onClick={(e) => { e.stopPropagation(); onViewProfile(m.key); }}
              >
                View Stats →
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Remaining rows */}
      <div className="space-y-0.5">
        {sorted.slice(sorted.length >= 3 ? 3 : 0).map((m, idx) => {
          const rank = (sorted.length >= 3 ? 3 : 0) + idx;
          const rawVal = m[sortKey] ?? 0;
          const barPct = maxVal > 0 ? (rawVal / maxVal) * 100 : 0;
          const color = leaderboardBarColor(m);

          return (
            <div
              key={m.key}
              className="group relative rounded-lg px-3 py-2 cursor-pointer transition-all bg-white/[0.03] hover:bg-white/[0.07]"
              onClick={() => onMemberClick(m.key)}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 shrink-0 text-center">
                  <span className="text-white/20 text-[10px] font-mono">#{rank + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white/60 truncate leading-none mb-1.5">{m.display}</div>
                  <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${color}`}
                      style={{ width: `${Math.max(barPct, barPct > 0 ? 1.5 : 0)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-x-2 mt-1 text-[10px] text-white/25 leading-none">
                    <span><span className="text-white/45">{m.completed}</span> done</span>
                    <span><span className="text-white/45">{m.open}</span> open</span>
                    {m.overdue > 0 && <span className="text-danger">{m.overdue} overdue</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`text-xl font-bold tabular-nums leading-none ${rateColorClass(m.onTimeRate)}`}>
                    {fmtLeaderboardValue(m, sortKey)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Member Section (sortable columns) ──────────────────────
function MemberSection({ member, expanded, onToggle, today, sectionRef, onViewProfile }) {
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
        <span
          className="text-[10px] text-accent hover:underline cursor-pointer shrink-0"
          onClick={(e) => { e.stopPropagation(); onViewProfile?.(); }}
        >
          View Stats →
        </span>
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

// ─── Period helpers ──────────────────────────────────────────
function getMondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function getPeriodRange(periodId, today) {
  const monday = getMondayOf(today);
  const year = today.slice(0, 4);
  const month = today.slice(5, 7);
  const qStart = ['01', '04', '07', '10'][Math.ceil(Number(month) / 3) - 1];
  const qEnd = ['03', '06', '09', '12'][Math.ceil(Number(month) / 3) - 1];
  const qEndDay = new Date(Number(year), Number(qEnd), 0).getDate();

  switch (periodId) {
    case 'thisWeek':    return { start: monday, end: addDays(monday, 6) };
    case 'lastWeek':    return { start: addDays(monday, -7), end: addDays(monday, -1) };
    case '2weeksAgo':   return { start: addDays(monday, -14), end: addDays(monday, -8) };
    case 'thisMonth':   return { start: `${year}-${month}-01`, end: today };
    case 'lastMonth': {
      const lm = Number(month) === 1 ? 12 : Number(month) - 1;
      const ly = Number(month) === 1 ? Number(year) - 1 : Number(year);
      const lmEnd = new Date(ly, lm, 0).getDate();
      return { start: `${ly}-${String(lm).padStart(2,'0')}-01`, end: `${ly}-${String(lm).padStart(2,'0')}-${lmEnd}` };
    }
    case 'thisQuarter': return { start: `${year}-${qStart}-01`, end: `${year}-${qEnd}-${String(qEndDay).padStart(2,'0')}` };
    case 'all':
    default:            return null; // no filter
  }
}

const PERIODS = [
  { id: 'all',        label: 'All Time' },
  { id: 'thisWeek',   label: 'This Week' },
  { id: 'lastWeek',   label: 'Last Week' },
  { id: '2weeksAgo',  label: '2 Weeks Ago' },
  { id: 'thisMonth',  label: 'This Month' },
  { id: 'lastMonth',  label: 'Last Month' },
  { id: 'thisQuarter',label: 'This Quarter' },
];

// Filter subtasks: include if due_on OR completed_at falls in the range
function subtaskInRange(st, range) {
  if (!range) return true; // all time
  const due = st.due_on || '';
  const done = st.completed_at ? st.completed_at.slice(0, 10) : '';
  return (due >= range.start && due <= range.end) || (done >= range.start && done <= range.end);
}

// ─── Main Component ──────────────────────────────────────────
export default function SubtasksTab({ data }) {
  const today = useMemo(() => todayStr(), []);
  const [activePeriod, setActivePeriod] = useState('all');

  const periodRange = useMemo(() => getPeriodRange(activePeriod, today), [activePeriod, today]);

  const members = useMemo(() => {
    if (!data?.jobs) return [];

    const allSubtasks = data.jobs.flatMap(job =>
      (job.subTasks || []).map(st => ({ ...st, _parentName: job.name })),
    );

    // Filter by period
    const filtered = allSubtasks.filter(st => subtaskInRange(st, periodRange));

    const grouped = {};
    for (const st of filtered) {
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
  }, [data, today, periodRange]);

  const [leaderboardSort, setLeaderboardSort] = useState('onTimeRate');

  const [expandedKeys, setExpandedKeys] = useState(() => {
    const initial = new Set();
    members.slice(0, 3).forEach(m => initial.add(m.key));
    return initial;
  });

  // Profile view state — when set, shows the chess.com-style stats page
  const [profileKey, setProfileKey] = useState(null);
  const profileMember = profileKey ? members.find(m => m.key === profileKey) : null;

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

  // Show profile view when a member is selected
  if (profileMember) {
    return (
      <Suspense fallback={<div className="text-center py-20 text-white/40">Loading stats...</div>}>
        <TeamMemberProfile
          memberData={profileMember}
          onClose={() => setProfileKey(null)}
        />
      </Suspense>
    );
  }

  if (members.length === 0) {
    return <div className="text-center py-20 text-white/30 text-sm">No subtask data available.</div>;
  }

  return (
    <div className="space-y-6">
      {/* ── Period selector ────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setActivePeriod(p.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activePeriod === p.id
                ? 'bg-accent text-white'
                : 'bg-white/5 text-white/50 hover:bg-white/10'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Leaderboard ─────────────────────────────────────── */}
      <ProductionLeaderboard
        members={members}
        sortKey={leaderboardSort}
        onSortChange={setLeaderboardSort}
        onViewProfile={(key) => setProfileKey(key)}
        onMemberClick={(key) => handleScoreCardClick(key)}
      />

      {/* ── Team member sections (sortable columns) ────────── */}
      <div className="space-y-3">
        {members.map(m => (
          <MemberSection
            key={m.key}
            member={m}
            expanded={expandedKeys.has(m.key)}
            onToggle={() => toggleSection(m.key)}
            onViewProfile={() => setProfileKey(m.key)}
            today={today}
            sectionRef={el => { sectionRefs.current[m.key] = el; }}
          />
        ))}
      </div>
    </div>
  );
}
