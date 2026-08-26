import React, { useState, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

// ─── Date helpers ─────────────────────────────────────────────

function toISO(d) { return d.toISOString().slice(0, 10); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}
function addDaysToISO(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function getMondayOf(iso) {
  const d = new Date(iso + 'T12:00:00');
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return toISO(d);
}

function buildMonthGrid(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const dow = firstOfMonth.getDay();
  const leadDays = dow === 0 ? 6 : dow - 1;
  const gridStart = new Date(year, month, 1 - leadDays);
  const today = todayISO();
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const iso = toISO(d);
    return { iso, num: d.getDate(), inMonth: d.getMonth() === month, isToday: iso === today };
  });
}

function buildWeekDays(mondayISO) {
  const today = todayISO();
  return Array.from({ length: 7 }, (_, i) => {
    const iso = addDaysToISO(mondayISO, i);
    const d = new Date(iso + 'T12:00:00');
    return {
      iso,
      num: d.getDate(),
      inMonth: true,
      isToday: iso === today,
      dayLabel: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
      monthLabel: d.toLocaleDateString('en-US', { month: 'short' }),
    };
  });
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ─── Deposit helpers ──────────────────────────────────────────

function isUnpaid(depositPaid) {
  if (!depositPaid) return false; // null = not configured, treat as neutral
  const s = String(depositPaid).toLowerCase();
  return s === 'no' || s === 'unpaid' || s === 'not paid' || s === 'pending';
}

function isPaid(depositPaid) {
  if (!depositPaid) return false;
  const s = String(depositPaid).toLowerCase();
  return s === 'yes' || s === 'paid';
}

function jobColors(crewColor, depositPaid) {
  const unpaid = isUnpaid(depositPaid);
  if (unpaid) {
    return { bg: 'rgba(245,158,11,0.35)', border: '#f59e0b', text: '#fde68a', shadow: '#f59e0b', unpaid: true };
  }
  const c = crewColor || '#4b5563';
  return { bg: c + '40', border: c, text: '#fff', shadow: c, unpaid: false };
}

// ─── Multi-day bar helpers ────────────────────────────────────

const BAR_H = 20;
const BAR_GAP = 2;
const DATE_HEADER_H = 20; // height of the date-number row in month-view day cells
const WEEK_HEADER_H = 44; // height of the day-label+date header in week-view columns

function getBarsForWeek(weekDays, multiDayJobs) {
  const weekStart = weekDays[0].iso;
  const weekEnd   = weekDays[6].iso;
  const inWeek = multiDayJobs.filter(j => j.startDate <= weekEnd && j.installDate >= weekStart);
  if (inWeek.length === 0) return [];
  inWeek.sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
  const colOf = (iso) => {
    const idx = weekDays.findIndex(d => d.iso === iso);
    return idx === -1 ? (iso < weekStart ? 0 : 6) : idx;
  };
  const laneEnds = [];
  return inWeek.map(job => {
    const clippedStart = job.startDate < weekStart ? weekStart : job.startDate;
    const clippedEnd   = job.installDate > weekEnd  ? weekEnd  : job.installDate;
    const colStart = colOf(clippedStart);
    const colEnd   = colOf(clippedEnd);
    let lane = laneEnds.findIndex(end => end < colStart);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = colEnd;
    return { job, colStart, colEnd, numCols: colEnd - colStart + 1, lane, isStart: job.startDate >= weekStart, isEnd: job.installDate <= weekEnd };
  });
}

// ─── Job drawer ───────────────────────────────────────────────

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function JobDrawer({ job, crewColor, onClose }) {
  if (!job) return null;
  const name = job.name.replace(/^INSTALLATION\s*[-–]\s*/i, '');
  const unpaid = isUnpaid(job.depositPaid);
  const paid   = isPaid(job.depositPaid);
  const colors = jobColors(crewColor, job.depositPaid);
  const isOverdue = !job.completed && job.installDate && job.installDate < todayISO();

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-96 max-w-full bg-white border-l border-gray-200 z-50 flex flex-col shadow-2xl overflow-hidden"
        style={{ animation: 'slideIn 0.2s ease-out' }}>

        {/* Deposit status banner */}
        {(unpaid || paid) && (
          <div className={`px-5 py-2.5 text-sm font-semibold flex items-center gap-2 ${
            unpaid ? 'bg-amber-500/20 text-amber-300 border-b border-amber-500/30'
                   : 'bg-green-500/15 text-green-300 border-b border-green-500/20'
          }`}>
            <span className="text-base">{unpaid ? '⚠' : '✓'}</span>
            {unpaid ? 'Deposit not paid — job may be rescheduled' : 'Deposit paid — job is committed'}
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-200">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: isOverdue ? '#ef4444' : colors.border }}
              />
              <span className="text-[11px] font-medium uppercase tracking-wider"
                style={{ color: isOverdue ? '#f87171' : colors.border }}>
                {job.section || 'Installation'}
              </span>
            </div>
            <h2 className="text-base font-bold text-gray-900 leading-snug">{name}</h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/[0.05] text-gray-500 hover:text-gray-900 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Dates */}
          <section>
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-2">Schedule</p>
            <div className="space-y-1.5">
              {job.startDate && job.startDate !== job.installDate ? (
                <Row label="Install window" value={`${fmt(job.startDate)} – ${fmt(job.installDate)}`} />
              ) : (
                <Row label="Install date" value={fmt(job.installDate)} />
              )}
              {job.surveyDate && <Row label="Survey date" value={fmt(job.surveyDate)} />}
              {job.serviceDate && <Row label="Service date" value={fmt(job.serviceDate)} />}
              {job.promisedDate && <Row label="Promised date" value={fmt(job.promisedDate)} />}
              {job.estimatedTime && <Row label="Est. time" value={`${job.estimatedTime} hrs`} />}
            </div>
          </section>

          {/* Status */}
          <section>
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-2">Status</p>
            <div className="space-y-1.5">
              <Row label="Job status" value={
                <span className={`capitalize font-semibold ${
                  isOverdue ? 'text-red-400' :
                  job.status === 'scheduled' ? 'text-cyan-400' :
                  job.status === 'at_risk' ? 'text-amber-400' :
                  job.status === 'completed' || job.status === 'on_time' || job.status === 'early' ? 'text-green-400' :
                  'text-gray-500'
                }`}>{isOverdue ? 'Overdue' : (job.status || '—')}</span>
              } />
              {job.rescheduleCount > 0 && (
                <Row label="Reschedules" value={
                  <span className="text-amber-400 font-semibold">{job.rescheduleCount}×</span>
                } />
              )}
              <Row label="Deposit" value={
                job.depositPaid == null
                  ? <span className="text-gray-500 text-[11px] italic">Not tracked</span>
                  : <span className={unpaid ? 'text-amber-400 font-semibold' : 'text-green-400 font-semibold'}>
                      {unpaid ? '⚠ Not paid' : '✓ Paid'}
                    </span>
              } />
            </div>
          </section>

          {/* Crew & Scope */}
          <section>
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-2">Assignment</p>
            <div className="space-y-1.5">
              <Row label="Crews" value={job.crews?.length ? job.crews.join(', ') : 'Unassigned'} />
              {job.scope && <Row label="Scope" value={job.scope} />}
              {job.pm && <Row label="PM" value={job.pm} />}
              {job.metro && <Row label="Metro" value={job.metro} />}
              {job.surveyRequired && <Row label="Survey required" value={job.surveyRequired} />}
            </div>
          </section>

          {/* Contact */}
          {(job.contactName || job.contactPhone || job.contactEmail || job.address) && (
            <section>
              <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-2">Contact</p>
              <div className="space-y-1.5">
                {job.contactName && <Row label="Name" value={job.contactName} />}
                {job.address && <Row label="Address" value={job.address} />}
                {job.contactPhone && (
                  <Row label="Phone" value={
                    <a href={`tel:${job.contactPhone}`} className="text-cyan-400 hover:text-cyan-300 transition-colors">
                      {job.contactPhone}
                    </a>
                  } />
                )}
                {job.contactEmail && (
                  <Row label="Email" value={
                    <a href={`mailto:${job.contactEmail}`} className="text-cyan-400 hover:text-cyan-300 transition-colors truncate block">
                      {job.contactEmail}
                    </a>
                  } />
                )}
              </div>
            </section>
          )}
        </div>

        {/* Footer — Asana link */}
        {job.url && (
          <div className="p-4 border-t border-gray-200">
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-black/[0.03] hover:bg-black/[0.05] text-gray-500 hover:text-gray-900 text-sm transition-colors"
            >
              <span>Open in Asana</span>
              <span className="text-xs">↗</span>
            </a>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </>,
    document.body
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[11px] text-gray-600 shrink-0 w-28">{label}</span>
      <span className="text-[12px] text-gray-700 flex-1 min-w-0">{value ?? '—'}</span>
    </div>
  );
}

// ─── Multi-day spanning bar ───────────────────────────────────

function MultiDayBar({ bar, crewColor, updating, onDragStart, onJobClick, headerH = DATE_HEADER_H }) {
  const job = bar.job;
  const isDone = job.completed;
  const colors = isDone
    ? { bg: 'rgba(34,197,94,0.35)', border: '#22c55e', text: '#fff', shadow: '#22c55e' }
    : jobColors(crewColor, job.depositPaid);

  const label = job.name.replace(/^INSTALLATION\s*[-–]\s*/i, '');
  const radius = bar.isStart && bar.isEnd ? '4px'
    : bar.isStart ? '4px 0 0 4px'
    : bar.isEnd   ? '0 4px 4px 0'
    : '0';

  return (
    <div
      draggable
      onDragStart={(e) => { e.stopPropagation(); onDragStart(e, job); }}
      onClick={(e) => { e.stopPropagation(); onJobClick(job); }}
      title={`${job.name}\n${job.crews?.join(', ') || 'Unassigned'}\n${job.startDate} → ${job.installDate}`}
      style={{
        position: 'absolute',
        top: headerH + bar.lane * (BAR_H + 2) + BAR_GAP,
        left: `calc(${bar.colStart} * 100% / 7 + 2px)`,
        width: `calc(${bar.numCols} * 100% / 7 - 4px)`,
        height: BAR_H,
        zIndex: 5,
        cursor: updating ? 'wait' : 'grab',
        opacity: updating ? 0.5 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 6,
        paddingRight: 4,
        overflow: 'hidden',
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}90`,
        borderLeft: bar.isStart ? `3px solid ${colors.border}` : `1px solid ${colors.border}50`,
        borderRight: bar.isEnd ? `1px solid ${colors.border}90` : 'none',
        borderRadius: radius,
        color: colors.text,
        fontSize: 11,
        fontWeight: 600,
        textShadow: `0 0 8px ${colors.shadow}`,
        whiteSpace: 'nowrap',
        gap: 4,
      }}>
        {colors.unpaid && <span style={{ fontSize: 9, opacity: 0.9 }}>⚠</span>}
        {(bar.isStart || bar.colStart === 0) && (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', opacity: isDone ? 0.6 : 1 }}>
            {label}
          </span>
        )}
        {updating && (
          <span style={{
            display: 'inline-block', width: 8, height: 8,
            border: '1.5px solid currentColor', borderTopColor: 'transparent',
            borderRadius: '50%', animation: 'spin 0.6s linear infinite',
            marginLeft: 4, flexShrink: 0,
          }} />
        )}
      </div>
    </div>
  );
}

// ─── Job chip (month view, single-day) ───────────────────────

function JobChip({ job, crewColor, updating, onDragStart, onJobClick }) {
  const isDone = job.completed;
  const isOverdue = !job.completed && job.installDate && job.installDate < todayISO();
  const isRescheduled = (job.rescheduleCount ?? 0) > 0;

  let colors;
  if (isDone) {
    colors = { bg: 'rgba(34,197,94,0.25)', border: '#22c55e', text: '#86efac', shadow: '#22c55e', unpaid: false };
  } else if (isOverdue) {
    colors = { bg: 'rgba(239,68,68,0.28)', border: '#ef4444', text: '#fca5a5', shadow: '#ef4444', unpaid: false };
  } else {
    colors = jobColors(crewColor, job.depositPaid);
  }

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, job)}
      onClick={(e) => { e.stopPropagation(); onJobClick(job); }}
      title={`${job.name}\n${job.crews?.join(', ') || 'Unassigned'}${isRescheduled ? ` · ${job.rescheduleCount} reschedule(s)` : ''}`}
      className="relative flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] cursor-pointer select-none truncate max-w-full transition-opacity hover:brightness-125"
      style={{
        opacity: updating ? 0.5 : 1,
        backgroundColor: colors.bg,
        borderLeft: `2.5px solid ${colors.border}`,
        color: colors.text,
        textShadow: `0 0 6px ${colors.shadow}80`,
        fontWeight: 600,
      }}
    >
      {updating && <span className="shrink-0 w-2.5 h-2.5 border border-gray-400 border-t-transparent rounded-full animate-spin" />}
      {colors.unpaid && !updating && <span className="shrink-0 text-[9px]">⚠</span>}
      {isRescheduled && !updating && !colors.unpaid && (
        <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-yellow-400/80" />
      )}
      <span className="truncate">{job.name.replace(/^INSTALLATION\s*[-–]\s*/i, '')}</span>
    </div>
  );
}

// ─── Week job card (weekly view, richer) ─────────────────────

function WeekJobCard({ job, crewColor, updating, onDragStart, onJobClick }) {
  const isDone = job.completed;
  const isOverdue = !job.completed && job.installDate && job.installDate < todayISO();
  const isRescheduled = (job.rescheduleCount ?? 0) > 0;

  let colors;
  if (isDone) {
    colors = { bg: 'rgba(34,197,94,0.20)', border: '#22c55e', text: '#86efac', shadow: '#22c55e', unpaid: false };
  } else if (isOverdue) {
    colors = { bg: 'rgba(239,68,68,0.22)', border: '#ef4444', text: '#fca5a5', shadow: '#ef4444', unpaid: false };
  } else {
    colors = jobColors(crewColor, job.depositPaid);
  }

  const name = job.name.replace(/^INSTALLATION\s*[-–]\s*/i, '');

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, job)}
      onClick={(e) => { e.stopPropagation(); onJobClick(job); }}
      className="rounded-lg px-2.5 py-2 cursor-pointer select-none transition-all hover:brightness-110 hover:scale-[1.01]"
      style={{
        opacity: updating ? 0.5 : 1,
        backgroundColor: colors.bg,
        borderLeft: `3px solid ${colors.border}`,
        outline: colors.unpaid ? `1px solid ${colors.border}50` : 'none',
      }}
    >
      {/* Job name */}
      <p className="text-[12px] font-semibold leading-tight mb-1" style={{ color: colors.text }}>
        {name}
      </p>

      {/* Crew */}
      <p className="text-[10px] opacity-60 leading-tight" style={{ color: colors.text }}>
        {job.crews?.length ? job.crews.join(', ') : 'Unassigned'}
      </p>

      {/* Badges */}
      <div className="flex flex-wrap gap-1 mt-1.5">
        {job.scope && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/[0.05] text-gray-500 font-medium">
            {job.scope}
          </span>
        )}
        {colors.unpaid && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
            ⚠ Deposit pending
          </span>
        )}
        {isRescheduled && !colors.unpaid && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-300 font-medium">
            {job.rescheduleCount}× rescheduled
          </span>
        )}
        {isOverdue && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-medium">
            Overdue
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Day cell (month view) ────────────────────────────────────

function DayCell({ day, jobs, crewColorMap, updatingSet, dragOver, expanded, barAreaH, onDragStart, onDragOver, onDragLeave, onDrop, onToggleExpand, onJobClick }) {
  const MAX_VISIBLE = 3;
  const visible  = expanded ? jobs : jobs.slice(0, MAX_VISIBLE);
  const overflow = jobs.length - MAX_VISIBLE;

  return (
    <div
      className={`rounded-lg flex flex-col border transition-colors min-h-[88px]
        ${day.isToday ? 'border-blue-500/50 bg-blue-500/5' : 'border-gray-200'}
        ${!day.inMonth ? 'opacity-40' : ''}
        ${dragOver ? 'border-blue-400/60 bg-blue-500/10' : ''}
      `}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Date number always on top */}
      <div className="px-1.5 pt-1 flex items-center" style={{ height: DATE_HEADER_H }}>
        <span className={`text-[11px] font-semibold leading-none
          ${day.isToday ? 'text-blue-400' : day.inMonth ? 'text-gray-900' : 'text-gray-500'}`}>
          {day.num}
        </span>
      </div>
      {/* Space reserved for spanning bars positioned absolutely */}
      <div style={{ height: barAreaH }} />
      {/* Single-day chips */}
      <div className="px-1.5 pb-1 flex flex-col gap-0.5">
        {visible.map(job => (
          <JobChip
            key={job.id}
            job={job}
            crewColor={crewColorMap.get(job.crews?.[0])}
            updating={updatingSet.has(job.id)}
            onDragStart={onDragStart}
            onJobClick={onJobClick}
          />
        ))}
        {overflow > 0 && (
          <button
            onClick={onToggleExpand}
            className="text-[10px] text-gray-500 hover:text-gray-600 pt-0.5 text-left transition-colors"
          >
            {expanded ? '▲ less' : `+${overflow} more`}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Week view ────────────────────────────────────────────────

function WeekView({ weekDays, multiDayJobs, singleDayJobs, crewColorMap, updatingSet, dragOverDate, onDragStart, onDragOver, onDragLeave, onDrop, onJobClick }) {
  const bars = getBarsForWeek(weekDays, multiDayJobs);
  const numLanes = bars.length > 0 ? Math.max(...bars.map(b => b.lane)) + 1 : 0;
  const barAreaH = numLanes > 0 ? numLanes * (BAR_H + 2) + BAR_GAP + 6 : 0;

  const jobsByDate = {};
  for (const j of singleDayJobs) {
    const d = (j.installDate || j.nativeDueOn)?.slice(0, 10);
    if (!d) continue;
    if (!jobsByDate[d]) jobsByDate[d] = [];
    jobsByDate[d].push(j);
  }
  // Group same-crew jobs together within each day
  for (const d of Object.keys(jobsByDate)) {
    jobsByDate[d].sort((a, b) => {
      const ca = a.crews?.[0] || '\uffff';
      const cb = b.crews?.[0] || '\uffff';
      return ca < cb ? -1 : ca > cb ? 1 : 0;
    });
  }

  return (
    <div>
      {/* Single relative grid — bars absolutely positioned below headers, inside columns */}
      <div className="relative grid grid-cols-7 gap-1">
        {/* Spanning bars: top offset = WEEK_HEADER_H so they appear below the date header */}
        {bars.map(bar => (
          <MultiDayBar
            key={bar.job.id}
            bar={bar}
            crewColor={crewColorMap.get(bar.job.crews?.[0])}
            updating={updatingSet.has(bar.job.id)}
            onDragStart={onDragStart}
            onJobClick={onJobClick}
            headerH={WEEK_HEADER_H}
          />
        ))}

        {/* Day columns */}
        {weekDays.map((day) => (
          <div
            key={day.iso}
            className={`min-h-[340px] rounded-xl border flex flex-col overflow-hidden transition-colors
              ${day.isToday ? 'border-blue-500/40 bg-blue-500/5' : 'border-gray-200 bg-black/[0.02]'}
              ${dragOverDate === day.iso ? 'border-blue-400/60 bg-blue-500/10' : ''}
            `}
            onDragOver={(e) => onDragOver(e, day.iso)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, day.iso)}
          >
            {/* Column header — fixed height matches WEEK_HEADER_H so bars align correctly */}
            <div
              className={`px-3 border-b flex items-center shrink-0 ${day.isToday ? 'border-blue-500/30' : 'border-gray-200'}`}
              style={{ height: WEEK_HEADER_H }}
            >
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${day.isToday ? 'text-blue-400' : 'text-gray-600'}`}>
                {day.dayLabel}
              </span>
              <span className={`ml-2 text-xl font-bold ${day.isToday ? 'text-blue-400' : 'text-gray-900'}`}>
                {day.num}
              </span>
              <span className={`ml-1 text-[10px] ${day.isToday ? 'text-blue-400/70' : 'text-gray-500'}`}>
                {day.monthLabel}
              </span>
            </div>

            {/* Spacer matching the bar area so job cards start below bars */}
            <div style={{ height: barAreaH, flexShrink: 0 }} />

            {/* Single-day job cards */}
            <div className="flex-1 p-1.5 flex flex-col gap-1.5 overflow-y-auto">
              {(jobsByDate[day.iso] || []).map(job => (
                <WeekJobCard
                  key={job.id}
                  job={job}
                  crewColor={crewColorMap.get(job.crews?.[0])}
                  updating={updatingSet.has(job.id)}
                  onDragStart={onDragStart}
                  onJobClick={onJobClick}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main CalendarView ────────────────────────────────────────

export default function CalendarView({ jobs, byCrew, onRefresh }) {
  const today = new Date();
  const [viewMode, setViewMode]       = useState('month');
  const [year, setYear]               = useState(today.getFullYear());
  const [month, setMonth]             = useState(today.getMonth());
  const [weekAnchor, setWeekAnchor]   = useState(() => getMondayOf(todayISO()));
  const [dragging, setDragging]       = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);
  const [updating, setUpdating]       = useState(new Set());
  const [overrides, setOverrides]     = useState({});
  const [toast, setToast]             = useState(null);
  const [expandedDay, setExpandedDay] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const toastTimer = useRef(null);

  const crewColorMap = useMemo(() => {
    const m = new Map();
    (byCrew || []).forEach(c => m.set(c.name, c.color));
    return m;
  }, [byCrew]);

  // Merge installDate + nativeDueOn (take the later date) and apply overrides
  const effectiveJobs = useMemo(() => {
    return jobs.map(j => {
      const cfEnd = j.installDate ?? null;
      const nativeEnd = j.nativeDueOn ?? null;
      const mergedEnd = cfEnd && nativeEnd
        ? (cfEnd >= nativeEnd ? cfEnd : nativeEnd)
        : (cfEnd || nativeEnd);
      return {
        ...j,
        installDate: overrides[j.id] ?? mergedEnd,
        startDate:   overrides[`${j.id}_start`] ?? j.startDate,
      };
    });
  }, [jobs, overrides]);

  const { multiDayJobs, singleDayJobs } = useMemo(() => {
    const multi   = effectiveJobs.filter(j => j.startDate && j.startDate < (j.installDate || ''));
    const multiIds = new Set(multi.map(j => j.id));
    return { multiDayJobs: multi, singleDayJobs: effectiveJobs.filter(j => !multiIds.has(j.id)) };
  }, [effectiveJobs]);

  const jobsByDate = useMemo(() => {
    const map = {};
    for (const j of singleDayJobs) {
      const dateKey = j.installDate || j.nativeDueOn;
      if (!dateKey) continue;
      const d = dateKey.slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(j);
    }
    // Group same-crew jobs together within each day
    for (const d of Object.keys(map)) {
      map[d].sort((a, b) => {
        const ca = a.crews?.[0] || '\uffff';
        const cb = b.crews?.[0] || '\uffff';
        return ca < cb ? -1 : ca > cb ? 1 : 0;
      });
    }
    return map;
  }, [singleDayJobs]);

  const grid  = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const weeks = useMemo(() => Array.from({ length: 6 }, (_, i) => grid.slice(i * 7, i * 7 + 7)), [grid]);
  const weekDays = useMemo(() => buildWeekDays(weekAnchor), [weekAnchor]);

  // Active crews for legend
  const activeCrws = useMemo(() => {
    const days = viewMode === 'week' ? weekDays : grid;
    const isoSet = new Set(days.map(d => d.iso));
    return (byCrew || []).filter(c =>
      effectiveJobs.some(j => j.crews?.includes(c.name) && isoSet.has(j.installDate?.slice(0, 10)))
    );
  }, [byCrew, effectiveJobs, grid, weekDays, viewMode]);

  // ── Navigation ────────────────────────────────────────────
  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1);
  }
  function goToday() {
    setYear(today.getFullYear()); setMonth(today.getMonth());
    setWeekAnchor(getMondayOf(todayISO()));
  }

  // ── Toast ─────────────────────────────────────────────────
  function showToast(msg, type = 'error') {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  // ── Drag handlers ─────────────────────────────────────────
  function handleDragStart(e, job) {
    setDragging({ job, fromDate: job.installDate?.slice(0, 10) });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', job.id);
  }
  function handleDragEnd() { setDragging(null); setDragOverDate(null); }
  function handleDragOver(e, dateStr) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverDate(dateStr);
  }
  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverDate(null);
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

    let newStartDate;
    if (job.startDate) {
      newStartDate = addDaysToISO(job.startDate, daysBetween(fromDate, toDate));
    }

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
      showToast(`${job.name.replace(/^INSTALLATION\s*[-–]\s*/i, '').slice(0, 40)} moved to ${toDate}`, 'success');
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
      setUpdating(prev => { const next = new Set(prev); next.delete(taskGid); return next; });
    }
  }, [dragging, onRefresh]);

  // ── Render ────────────────────────────────────────────────
  const weekLabel = (() => {
    const mon = new Date(weekAnchor + 'T12:00:00');
    const sun = new Date(weekAnchor + 'T12:00:00');
    sun.setDate(sun.getDate() + 6);
    const fmtShort = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmtShort(mon)} – ${fmtShort(sun)}, ${sun.getFullYear()}`;
  })();

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 relative">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            Installation Calendar
          </h2>
          {/* View toggle */}
          <div className="flex bg-black/[0.03] rounded-lg p-0.5">
            {['month', 'week'].map(v => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                  viewMode === v ? 'bg-black/[0.05] text-gray-900' : 'text-gray-500 hover:text-gray-600'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={goToday} className="text-xs text-gray-500 hover:text-gray-600 px-2 py-1 rounded border border-gray-200 hover:border-gray-300 transition-colors mr-2">
            Today
          </button>
          <button
            onClick={() => viewMode === 'month' ? prevMonth() : setWeekAnchor(w => addDaysToISO(w, -7))}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-black/[0.05] text-gray-500 hover:text-gray-900 transition-colors"
          >‹</button>
          <span className="text-sm font-semibold text-gray-900 w-48 text-center">
            {viewMode === 'month' ? `${MONTH_NAMES[month]} ${year}` : weekLabel}
          </span>
          <button
            onClick={() => viewMode === 'month' ? nextMonth() : setWeekAnchor(w => addDaysToISO(w, 7))}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-black/[0.05] text-gray-500 hover:text-gray-900 transition-colors"
          >›</button>
        </div>
      </div>

      {/* Calendar + legend side by side */}
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">

          {/* Day-of-week header (month view only) */}
          {viewMode === 'month' && (
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAY_LABELS.map(d => (
                <div key={d} className="text-center text-[10px] font-semibold text-gray-600 uppercase tracking-wider py-1">{d}</div>
              ))}
            </div>
          )}

          {/* Month view */}
          {viewMode === 'month' && (
            <div className="space-y-1" onDragEnd={handleDragEnd}>
              {weeks.map((week, wi) => {
                const bars     = getBarsForWeek(week, multiDayJobs);
                const numLanes = bars.length > 0 ? Math.max(...bars.map(b => b.lane)) + 1 : 0;
                const barAreaH = numLanes > 0 ? numLanes * (BAR_H + 2) + BAR_GAP + 2 : 0;
                return (
                  <div key={wi} className="relative grid grid-cols-7 gap-1">
                    {bars.map(bar => (
                      <MultiDayBar
                        key={bar.job.id}
                        bar={bar}
                        crewColor={crewColorMap.get(bar.job.crews?.[0])}
                        updating={updating.has(bar.job.id)}
                        onDragStart={handleDragStart}
                        onJobClick={setSelectedJob}
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
                        barAreaH={barAreaH}
                        onDragStart={handleDragStart}
                        onDragOver={(e) => handleDragOver(e, day.iso)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, day.iso)}
                        onToggleExpand={() => setExpandedDay(prev => prev === day.iso ? null : day.iso)}
                        onJobClick={setSelectedJob}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Week view */}
          {viewMode === 'week' && (
            <div onDragEnd={handleDragEnd}>
              <WeekView
                weekDays={weekDays}
                multiDayJobs={multiDayJobs}
                singleDayJobs={singleDayJobs}
                crewColorMap={crewColorMap}
                updatingSet={updating}
                dragOverDate={dragOverDate}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onJobClick={setSelectedJob}
              />
            </div>
          )}
        </div>

        {/* Legend sidebar */}
        <div className="w-36 shrink-0 flex flex-col gap-3 pt-1">
          <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Crews</p>
          <div className="flex flex-col gap-1.5">
            {(activeCrws.length > 0 ? activeCrws : (byCrew || [])).map(c => (
              <div key={c.name} className="flex items-center gap-2">
                <span className="shrink-0 w-3 h-3 rounded-sm" style={{ backgroundColor: c.color }} />
                <span className="text-[11px] text-gray-700 leading-tight">{c.name}</span>
              </div>
            ))}
          </div>

          <div className="mt-2 pt-2 border-t border-gray-200 flex flex-col gap-2">
            <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Status</p>
            {[
              { color: '#22c55e', label: 'Completed' },
              { color: '#ef4444', label: 'Overdue' },
              { color: '#eab308', label: 'Rescheduled', dot: true },
              { color: '#f59e0b', label: 'Deposit pending', dot: true, icon: '⚠' },
            ].map(({ color, label, dot, icon }) => (
              <div key={label} className="flex items-center gap-2">
                {dot
                  ? <span className="shrink-0 text-[11px]" style={{ color }}>{icon || '●'}</span>
                  : <span className="shrink-0 w-3 h-3 rounded-sm" style={{ backgroundColor: color + '30', border: `2px solid ${color}` }} />
                }
                <span className="text-[11px] text-gray-700">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium shadow-lg pointer-events-none
          ${toast.type === 'success' ? 'bg-green-500/20 border border-green-500/30 text-green-300' : 'bg-red-500/20 border border-red-500/30 text-red-300'}
        `}>
          {toast.msg}
        </div>
      )}

      {/* Job drawer */}
      <JobDrawer
        job={selectedJob}
        crewColor={crewColorMap.get(selectedJob?.crews?.[0])}
        onClose={() => setSelectedJob(null)}
      />
    </div>
  );
}
