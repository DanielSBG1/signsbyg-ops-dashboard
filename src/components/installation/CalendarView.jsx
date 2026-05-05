import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

// ─── Date helpers ─────────────────────────────────────────────

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

// ─── Job chip ─────────────────────────────────────────────────

function JobChip({ job, crewColor, updating, onDragStart }) {
  const isDone = job.completed;
  const isOverdue = !job.completed && job.installDate < todayISO();
  const isRescheduled = (job.rescheduleCount ?? 0) > 0;

  let borderColor = crewColor || '#4b5563';
  if (isDone) borderColor = '#22c55e';
  else if (isOverdue) borderColor = '#ef4444';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, job)}
      title={`${job.name}\n${job.crews?.join(', ') || 'Unassigned'}${isRescheduled ? ` · ${job.rescheduleCount} reschedule(s)` : ''}`}
      className={`
        relative flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] cursor-grab active:cursor-grabbing
        select-none truncate max-w-full
        ${isDone ? 'bg-green-500/10 text-green-300/80' : isOverdue ? 'bg-red-500/10 text-red-300/80' : 'bg-white/[0.06] text-white/75'}
        ${updating ? 'opacity-50' : 'hover:bg-white/10'}
        transition-opacity
      `}
      style={{ borderLeft: `2px solid ${borderColor}` }}
    >
      {updating && (
        <span className="shrink-0 w-2.5 h-2.5 border border-white/40 border-t-transparent rounded-full animate-spin" />
      )}
      {isRescheduled && !updating && (
        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-yellow-400/70" title="Rescheduled" />
      )}
      <span className="truncate">{job.name.replace(/^INSTALLATION\s*[-–]\s*/i, '')}</span>
    </div>
  );
}

// ─── Day cell ─────────────────────────────────────────────────

function DayCell({ day, jobs, crewColorMap, updatingSet, dragOver, onDragStart, onDragOver, onDragLeave, onDrop, onShowMore }) {
  const MAX_VISIBLE = 3;
  const visible = jobs.slice(0, MAX_VISIBLE);
  const overflow = jobs.length - MAX_VISIBLE;

  return (
    <div
      className={`
        min-h-[90px] rounded-lg p-1.5 flex flex-col gap-0.5
        border transition-colors
        ${day.isToday ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/[0.04]'}
        ${!day.inMonth ? 'opacity-40' : ''}
        ${dragOver ? 'border-blue-400/60 bg-blue-500/10' : ''}
      `}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Date number */}
      <span className={`text-[11px] font-semibold px-0.5 leading-none mb-0.5
        ${day.isToday ? 'text-blue-400' : day.inMonth ? 'text-white/60' : 'text-white/25'}
      `}>
        {day.num}
      </span>

      {/* Job chips */}
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
          onClick={onShowMore}
          className="text-[10px] text-white/40 hover:text-white/70 px-1 pt-0.5 text-left transition-colors"
        >
          +{overflow} more
        </button>
      )}
    </div>
  );
}

// ─── Day detail modal ─────────────────────────────────────────

function DayModal({ dateISO, jobs, crewColorMap, onClose }) {
  const label = new Date(dateISO + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const today = todayISO();

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Portal into body so the modal is never inside a stacking/compositing context
  // that would break pointer events on the calendar after closing.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative bg-[#1a1f2e] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div>
            <p className="text-xs text-white/40 font-medium uppercase tracking-wider">
              {jobs.length} job{jobs.length !== 1 ? 's' : ''}
            </p>
            <h3 className="text-base font-semibold text-white mt-0.5">{label}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/70 transition-colors text-lg leading-none p-1"
          >
            ✕
          </button>
        </div>

        {/* Job list */}
        <div className="overflow-y-auto divide-y divide-white/[0.04]">
          {jobs.map(job => {
            const color = crewColorMap.get(job.crews?.[0]) || '#4b5563';
            const isDone = job.completed;
            const isOverdue = !isDone && job.installDate < today;
            const isRescheduled = (job.rescheduleCount ?? 0) > 0;

            return (
              <div key={job.id} className="flex items-start gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors">
                <span
                  className="mt-0.5 shrink-0 w-1 h-full min-h-[32px] rounded-full"
                  style={{ backgroundColor: isDone ? '#22c55e' : isOverdue ? '#ef4444' : color }}
                />
                <div className="flex-1 min-w-0">
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-white/85 hover:text-white transition-colors block truncate font-medium"
                    title={job.name}
                  >
                    {job.name.replace(/^INSTALLATION\s*[-–]\s*/i, '')}
                  </a>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {job.crews?.length > 0 && (
                      <span className="text-[11px] text-white/40">{job.crews.join(', ')}</span>
                    )}
                    {isDone && <span className="text-[11px] text-green-400">Done</span>}
                    {isOverdue && <span className="text-[11px] text-red-400">Overdue</span>}
                    {isRescheduled && (
                      <span className="text-[11px] text-yellow-400/80">
                        {job.rescheduleCount} reschedule{job.rescheduleCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {job.pm && <span className="text-[11px] text-white/30">PM: {job.pm}</span>}
                  </div>
                </div>
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-white/20 hover:text-white/60 transition-colors text-xs mt-0.5"
                  title="Open in Asana"
                >
                  ↗
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Main CalendarView ────────────────────────────────────────

export default function CalendarView({ jobs, byCrew, onRefresh }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [dragging, setDragging] = useState(null);   // { job, fromDate }
  const [dragOverDate, setDragOverDate] = useState(null);
  const [updating, setUpdating] = useState(new Set());  // Set of taskGids
  const [overrides, setOverrides] = useState({});       // { taskGid: newDateISO }
  const [toast, setToast] = useState(null);             // { msg, type }
  const [selectedDay, setSelectedDay] = useState(null); // date ISO string for modal
  const toastTimer = useRef(null);

  // Build crew → color map
  const crewColorMap = useMemo(() => {
    const m = new Map();
    (byCrew || []).forEach(c => m.set(c.name, c.color));
    return m;
  }, [byCrew]);

  // Apply local date overrides on top of server data
  const effectiveJobs = useMemo(() => {
    return jobs.map(j => ({
      ...j,
      installDate: overrides[j.id] ?? j.installDate,
    }));
  }, [jobs, overrides]);

  // Group jobs by install date
  const jobsByDate = useMemo(() => {
    const map = {};
    for (const j of effectiveJobs) {
      if (!j.installDate) continue;
      const d = j.installDate.slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(j);
    }
    return map;
  }, [effectiveJobs]);

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);

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
    // Only clear if truly leaving the cell (not entering a child)
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

    // Optimistic update
    setOverrides(prev => ({ ...prev, [taskGid]: toDate }));
    setUpdating(prev => new Set(prev).add(taskGid));

    try {
      const res = await fetch('/api/installation-update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskGid, installDate: toDate }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      showToast(`${job.name.replace(/^INSTALLATION\s*[-–]\s*/i, '').slice(0, 40)} moved to ${toDate}`, 'success');
      // Refresh after a short delay so Asana has time to persist
      setTimeout(() => onRefresh?.(), 2000);
    } catch (err) {
      // Rollback
      setOverrides(prev => {
        const next = { ...prev };
        delete next[taskGid];
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

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-white/30 uppercase tracking-wider py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div
        className="grid grid-cols-7 gap-1"
        onDragEnd={handleDragEnd}
      >
        {grid.map(day => (
          <DayCell
            key={day.iso}
            day={day}
            jobs={jobsByDate[day.iso] || []}
            crewColorMap={crewColorMap}
            updatingSet={updating}
            dragOver={dragOverDate === day.iso}
            onDragStart={handleDragStart}
            onDragOver={(e) => handleDragOver(e, day.iso)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, day.iso)}
            onShowMore={() => setSelectedDay(day.iso)}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-1 border-t border-white/5 flex-wrap">
        <span className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">Crews</span>
        {(byCrew || []).filter(c => c.open > 0 || c.total > 0).slice(0, 8).map(c => (
          <div key={c.name} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: c.color }} />
            <span className="text-[10px] text-white/50">{c.name}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 ml-auto">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400/70" />
          <span className="text-[10px] text-white/40">Rescheduled</span>
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

      {/* Day detail modal */}
      {selectedDay && (
        <DayModal
          dateISO={selectedDay}
          jobs={jobsByDate[selectedDay] || []}
          crewColorMap={crewColorMap}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}
