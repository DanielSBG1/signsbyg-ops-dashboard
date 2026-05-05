import React, { useState, useMemo, useCallback, useRef } from 'react';

// ─── Date helpers ─────────────────────────────────────────────

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round(
    (new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000
  );
}

function addDaysToISO(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Returns the 42-day grid for the calendar month containing `year/month`. */
function buildMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const dow = firstOfMonth.getDay(); // 0=Sun
  const leadDays = dow === 0 ? 6 : dow - 1; // shift to Mon start

  const gridStart = new Date(year, month, 1 - leadDays);
  const today = todayISO();

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const iso = toISO(d);
    return {
      iso,
      num: d.getDate(),
      inMonth: d.getMonth() === month,
      isToday: iso === today,
    };
  });
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ─── Multi-day bar helpers ────────────────────────────────────

const BAR_H = 20;   // px height per bar lane
const BAR_GAP = 2;  // px gap between bar top and cell top

/**
 * For a given 7-day week row, compute which multi-day jobs have bars here
 * and assign non-overlapping lanes.
 */
function getBarsForWeek(weekDays, multiDayJobs) {
  const weekStart = weekDays[0].iso;
  const weekEnd = weekDays[6].iso;

  const inWeek = multiDayJobs.filter(
    j => j.startDate <= weekEnd && j.installDate >= weekStart
  );
  if (inWeek.length === 0) return [];

  inWeek.sort((a, b) => (a.startDate < b.startDate ? -1 : 1));

  const colOf = (iso) => {
    const idx = weekDays.findIndex(d => d.iso === iso);
    return idx === -1 ? (iso < weekStart ? 0 : 6) : idx;
  };

  const laneEnds = []; // laneEnds[lane] = colEnd of last bar in that lane

  return inWeek.map(job => {
    const clippedStart = job.startDate < weekStart ? weekStart : job.startDate;
    const clippedEnd   = job.installDate > weekEnd  ? weekEnd  : job.installDate;

    const colStart = colOf(clippedStart);
    const colEnd   = colOf(clippedEnd);

    // Greedy lane: find first lane whose last bar ended before this one starts
    let lane = laneEnds.findIndex(end => end < colStart);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = colEnd;

    return {
      job,
      colStart,
      colEnd,
      numCols: colEnd - colStart + 1,
      lane,
      isStart: job.startDate >= weekStart,
      isEnd:   job.installDate <= weekEnd,
    };
  });
}

// ─── Multi-day spanning bar ───────────────────────────────────

function MultiDayBar({ bar, color, updating, onDragStart }) {
  const isDone = bar.job.completed;
  const effectiveColor = isDone ? '#22c55e' : color;
  const label = bar.job.name.replace(/^INSTALLATION\s*[-–]\s*/i, '');

  const radius = bar.isStart && bar.isEnd ? '4px'
    : bar.isStart ? '4px 0 0 4px'
    : bar.isEnd   ? '0 4px 4px 0'
    : '0';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, bar.job)}
      title={`${bar.job.name}\n${bar.job.crews?.join(', ') || 'Unassigned'}\n${bar.job.startDate} → ${bar.job.installDate}`}
      style={{
        position: 'absolute',
        top: bar.lane * (BAR_H + 2) + BAR_GAP,
        left: `calc(${bar.colStart} * 100% / 7 + 2px)`,
        width: `calc(${bar.numCols} * 100% / 7 - 4px)`,
        height: BAR_H,
        zIndex: 5,
        cursor: updating ? 'wait' : 'grab',
        opacity: updating ? 0.5 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 6,
          paddingRight: 4,
          overflow: 'hidden',
          backgroundColor: effectiveColor + '22',
          border: `1px solid ${effectiveColor}50`,
          borderLeft: bar.isStart ? `3px solid ${effectiveColor}` : `1px solid ${effectiveColor}30`,
          borderRight: bar.isEnd ? `1px solid ${effectiveColor}50` : 'none',
          borderRadius: radius,
          color: effectiveColor,
          fontSize: 11,
          whiteSpace: 'nowrap',
        }}
      >
        {/* Only show label at the start of the bar (or when bar continues from prev week at col 0) */}
        {(bar.isStart || bar.colStart === 0) && (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', opacity: isDone ? 0.6 : 1 }}>
            {label}
          </span>
        )}
        {updating && (
          <span
            style={{
              display: 'inline-block',
              width: 8, height: 8,
              border: '1.5px solid currentColor',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite',
              marginLeft: 4,
              flexShrink: 0,
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Job chip (single-day) ────────────────────────────────────

function JobChip({ job, crewColor, updating, onDragStart }) {
  const isDone = job.completed;
  const isOverdue = !job.completed && job.installDate < todayISO();
  const isRescheduled = (job.rescheduleCount ?? 0) > 0;

  // Determine colors
  let bg, border, text;
  if (isDone) {
    bg = 'rgba(34,197,94,0.12)'; border = '#22c55e'; text = 'rgba(134,239,172,0.85)';
  } else if (isOverdue) {
    bg = 'rgba(239,68,68,0.12)'; border = '#ef4444'; text = 'rgba(252,165,165,0.85)';
  } else {
    const c = crewColor || '#4b5563';
    bg = c + '22'; border = c; text = null; // null = use default white
  }

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, job)}
      title={`${job.name}\n${job.crews?.join(', ') || 'Unassigned'}${isRescheduled ? ` · ${job.rescheduleCount} reschedule(s)` : ''}`}
      className={`
        relative flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] cursor-grab active:cursor-grabbing
        select-none truncate max-w-full transition-opacity
        ${updating ? 'opacity-50' : 'hover:brightness-125'}
      `}
      style={{
        backgroundColor: bg,
        borderLeft: `2.5px solid ${border}`,
        color: text || 'rgba(255,255,255,0.82)',
      }}
    >
      {updating && (
        <span className="shrink-0 w-2.5 h-2.5 border border-white/40 border-t-transparent rounded-full animate-spin" />
      )}
      {isRescheduled && !updating && (
        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-yellow-400/80" title="Rescheduled" />
      )}
      <span className="truncate">{job.name.replace(/^INSTALLATION\s*[-–]\s*/i, '')}</span>
    </div>
  );
}

// ─── Day cell ─────────────────────────────────────────────────

function DayCell({ day, jobs, crewColorMap, updatingSet, dragOver, expanded, topOffset, onDragStart, onDragOver, onDragLeave, onDrop, onToggleExpand }) {
  const MAX_VISIBLE = 3;
  const visible = expanded ? jobs : jobs.slice(0, MAX_VISIBLE);
  const overflow = jobs.length - MAX_VISIBLE;

  return (
    <div
      className={`
        rounded-lg flex flex-col gap-0.5
        border transition-colors min-h-[88px]
        ${day.isToday ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/[0.04]'}
        ${!day.inMonth ? 'opacity-40' : ''}
        ${dragOver ? 'border-blue-400/60 bg-blue-500/10' : ''}
      `}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Spacer pushes date number + chips below the bar layer */}
      <div style={{ height: topOffset }} />

      <div className="px-1.5 pb-1 flex flex-col gap-0.5">
        <span className={`text-[11px] font-semibold leading-none mb-0.5
          ${day.isToday ? 'text-blue-400' : day.inMonth ? 'text-white/60' : 'text-white/25'}
        `}>
          {day.num}
        </span>

        {visible.map(job => (
          <JobChip
            key={job.id}
            job={job}
            crewColor={crewColorMap.get(job.crews?.[0])}
            updating={updatingSet.has(job.id)}
            onDragStart={onDragStart}
          />
        ))}

        {overflow > 0 && (
          <button
            onClick={onToggleExpand}
            className="text-[10px] text-white/40 hover:text-white/70 pt-0.5 text-left transition-colors"
          >
            {expanded ? '▲ less' : `+${overflow} more`}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main CalendarView ────────────────────────────────────────

export default function CalendarView({ jobs, byCrew, onRefresh }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [dragging, setDragging] = useState(null);      // { job, fromDate }
  const [dragOverDate, setDragOverDate] = useState(null);
  const [updating, setUpdating] = useState(new Set()); // Set of taskGids
  const [overrides, setOverrides] = useState({});      // { taskGid: newEndDate, `${taskGid}_start`: newStartDate }
  const [toast, setToast] = useState(null);            // { msg, type }
  const [expandedDay, setExpandedDay] = useState(null);
  const toastTimer = useRef(null);

  // Build crew → color map
  const crewColorMap = useMemo(() => {
    const m = new Map();
    (byCrew || []).forEach(c => m.set(c.name, c.color));
    return m;
  }, [byCrew]);

  // Apply local overrides on top of server data
  const effectiveJobs = useMemo(() => {
    return jobs.map(j => ({
      ...j,
      installDate: overrides[j.id] ?? j.installDate,
      startDate:   overrides[`${j.id}_start`] ?? j.startDate,
    }));
  }, [jobs, overrides]);

  // Split into multi-day (spanning bar) and single-day (chip)
  const { multiDayJobs, singleDayJobs } = useMemo(() => {
    const multi = effectiveJobs.filter(j => j.startDate && j.startDate < (j.installDate || ''));
    const multiIds = new Set(multi.map(j => j.id));
    return {
      multiDayJobs: multi,
      singleDayJobs: effectiveJobs.filter(j => !multiIds.has(j.id)),
    };
  }, [effectiveJobs]);

  // Group single-day jobs by install date
  const jobsByDate = useMemo(() => {
    const map = {};
    for (const j of singleDayJobs) {
      if (!j.installDate) continue;
      const d = j.installDate.slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(j);
    }
    return map;
  }, [singleDayJobs]);

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);

  // Split grid into 6 week rows
  const weeks = useMemo(() =>
    Array.from({ length: 6 }, (_, i) => grid.slice(i * 7, i * 7 + 7)),
    [grid]
  );

  // ── Navigation ───────────────────────────────────────────────
  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }
  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }

  // ── Toast helper ─────────────────────────────────────────────
  function showToast(msg, type = 'error') {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  // ── Drag handlers ────────────────────────────────────────────
  function handleDragStart(e, job) {
    setDragging({ job, fromDate: job.installDate?.slice(0, 10) });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', job.id);
  }

  function handleDragEnd() {
    setDragging(null);
    setDragOverDate(null);
  }

  function handleDragOver(e, dateStr) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDate(dateStr);
  }

  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverDate(null);
    }
  }

  const handleDrop = useCallback(async (e, toDate) => {
    e.preventDefault();
    setDragOverDate(null);

    const taskGid = e.dataTransfer.getData('text/plain');
    if (!taskGid || !dragging) return;

    const fromDate = dragging.fromDate;
    if (fromDate === toDate) return;

    const job = dragging.job;
    setDragging(null);

    // For multi-day jobs shift startDate by the same delta
    let newStartDate;
    if (job.startDate) {
      const delta = daysBetween(fromDate, toDate);
      newStartDate = addDaysToISO(job.startDate, delta);
    }

    // Optimistic update
    setOverrides(prev => ({
      ...prev,
      [taskGid]: toDate,
      ...(newStartDate !== undefined ? { [`${taskGid}_start`]: newStartDate } : {}),
    }));
    setUpdating(prev => new Set(prev).add(taskGid));

    try {
      const body = { taskGid, installDate: toDate };
      if (newStartDate !== undefined) body.startDate = newStartDate;

      const res = await fetch('/api/installation-update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      showToast(
        `${job.name.replace(/^INSTALLATION\s*[-–]\s*/i, '').slice(0, 40)} moved to ${toDate}`,
        'success'
      );
      setTimeout(() => onRefresh?.(), 2000);
    } catch (err) {
      setOverrides(prev => {
        const next = { ...prev };
        delete next[taskGid];
        delete next[`${taskGid}_start`];
        return next;
      });
      showToast(`Update failed: ${err.message}`);
    } finally {
      setUpdating(prev => {
        const next = new Set(prev);
        next.delete(taskGid);
        return next;
      });
    }
  }, [dragging, onRefresh]);

  // Crews that actually have jobs in the current month's grid
  const activeCrws = useMemo(() => {
    const isoSet = new Set(grid.map(d => d.iso));
    return (byCrew || []).filter(c =>
      effectiveJobs.some(j =>
        j.crews?.includes(c.name) &&
        j.installDate && isoSet.has(j.installDate.slice(0, 10))
      )
    );
  }, [byCrew, effectiveJobs, grid]);

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-5 space-y-4 relative">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">
          Installation Calendar
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={goToday}
            className="text-xs text-white/40 hover:text-white/70 px-2 py-1 rounded border border-white/10 hover:border-white/20 transition-colors mr-2"
          >
            Today
          </button>
          <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors">
            ‹
          </button>
          <span className="text-sm font-semibold text-white/80 w-32 text-center">
            {MONTH_NAMES[month]} {year}
          </span>
          <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors">
            ›
          </button>
        </div>
      </div>

      {/* Calendar + legend side by side */}
      <div className="flex gap-4">
        {/* Calendar grid */}
        <div className="flex-1 min-w-0">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAY_LABELS.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="space-y-1" onDragEnd={handleDragEnd}>
            {weeks.map((week, wi) => {
              const bars = getBarsForWeek(week, multiDayJobs);
              const numLanes = bars.length > 0 ? Math.max(...bars.map(b => b.lane)) + 1 : 0;
              const topOffset = numLanes > 0 ? numLanes * (BAR_H + 2) + BAR_GAP + 4 : 4;

              return (
                <div key={wi} className="relative grid grid-cols-7 gap-1">
                  {bars.map(bar => (
                    <MultiDayBar
                      key={bar.job.id}
                      bar={bar}
                      color={crewColorMap.get(bar.job.crews?.[0]) || '#4b5563'}
                      updating={updating.has(bar.job.id)}
                      onDragStart={handleDragStart}
                    />
                  ))}
                  {week.map(day => (
                    <DayCell
                      key={day.iso}
                      day={day}
                      jobs={jobsByDate[day.iso] || []}
                      crewColorMap={crewColorMap}
                      updatingSet={updating}
                      dragOver={dragOverDate === day.iso}
                      expanded={expandedDay === day.iso}
                      topOffset={topOffset}
                      onDragStart={handleDragStart}
                      onDragOver={(e) => handleDragOver(e, day.iso)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, day.iso)}
                      onToggleExpand={() => setExpandedDay(prev => prev === day.iso ? null : day.iso)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend sidebar */}
        <div className="w-36 shrink-0 flex flex-col gap-3 pt-8">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Crews</p>
          <div className="flex flex-col gap-1.5">
            {(activeCrws.length > 0 ? activeCrws : (byCrew || [])).map(c => (
              <div key={c.name} className="flex items-center gap-2">
                <span
                  className="shrink-0 w-3 h-3 rounded-sm"
                  style={{ backgroundColor: c.color }}
                />
                <span className="text-[11px] text-white/60 leading-tight">{c.name}</span>
              </div>
            ))}
          </div>

          <div className="mt-2 pt-2 border-t border-white/5 flex flex-col gap-2">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Status</p>
            {[
              { color: '#22c55e', label: 'Completed' },
              { color: '#ef4444', label: 'Overdue' },
              { color: '#eab308', label: 'Rescheduled', dot: true },
            ].map(({ color, label, dot }) => (
              <div key={label} className="flex items-center gap-2">
                {dot
                  ? <span className="shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  : <span className="shrink-0 w-3 h-3 rounded-sm" style={{ backgroundColor: color + '30', border: `2px solid ${color}` }} />
                }
                <span className="text-[11px] text-white/50">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`
          absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium shadow-lg pointer-events-none
          ${toast.type === 'success' ? 'bg-green-500/20 border border-green-500/30 text-green-300' : 'bg-red-500/20 border border-red-500/30 text-red-300'}
        `}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
