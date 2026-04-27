import React, { useState } from 'react';

function fmt(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const ACTIVE_SALES_REP_IDS = new Set([
  '761399091',  // Alex Temple
  '162277230',  // Brailin Matos
  '162893149',  // Arif Rahman
  '430775871',  // Antonella Briceno
  '1977160866', // Daniel Garnier
  '161774309',  // Abhijeet Gaikwad
  '163074206',  // Siddhen Raut
]);

export default function RepActivity({ reps, data }) {
  const [expanded, setExpanded] = useState(null);

  if (!data) {
    return (
      <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white/80">Rep Activity</h2>
          <span className="text-[10px] text-white/25 uppercase tracking-widest">Loading…</span>
        </div>
        <div className="space-y-1.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const mode = data.mode || 'current';
  const byOwner = data.byOwner || {};
  const ownerNames = data.owners || {}; // id → display name from API

  // Show only the active sales reps, sorted by name
  let activeReps;
  if (Object.keys(ownerNames).length > 0) {
    activeReps = [...ACTIVE_SALES_REP_IDS]
      .filter((id) => ownerNames[id] && byOwner[id])
      .map((id) => ({ id, name: ownerNames[id] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } else {
    // Fallback: filter metrics reps to active sales reps with data
    activeReps = (reps || []).filter((rep) => rep.id && ACTIVE_SALES_REP_IDS.has(rep.id) && byOwner[rep.id]);
  }

  const headerLabel = mode === 'current'
    ? 'Current State · Tasks & Meetings This Week'
    : `${data.periodLabel || 'Period'} · Completed Tasks & Meetings`;

  if (activeReps.length === 0) {
    return (
      <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white/80">Rep Activity</h2>
          <span className="text-[10px] text-white/25 uppercase tracking-widest">{headerLabel}</span>
        </div>
        <p className="text-white/40 text-sm">No activity data for this period.</p>
      </div>
    );
  }

  function toggleExpand(repId, type) {
    const key = `${repId}:${type}`;
    setExpanded(expanded === key ? null : key);
  }

  function StatBadge({ count, type, repId, colorClass, emptyClass }) {
    const key = `${repId}:${type}`;
    const isOpen = expanded === key;
    const clickable = count > 0;
    return (
      <button
        onClick={() => clickable && toggleExpand(repId, type)}
        disabled={!clickable}
        className={`tabular-nums text-xs px-2 py-0.5 rounded transition-colors ${
          clickable ? 'cursor-pointer hover:ring-1 hover:ring-white/20' : 'cursor-default'
        } ${count > 0 ? colorClass : emptyClass} ${isOpen ? 'ring-1 ring-white/30' : ''}`}
      >
        {count}
      </button>
    );
  }

  // Column grid differs by mode
  // current:    Rep | Open | Overdue | Due Today | Meetings | Attended
  // historical: Rep | Completed | Late | Meetings | Attended
  const gridCurrent    = 'grid-cols-[1fr_72px_72px_80px_72px_80px]';
  const gridHistorical = 'grid-cols-[1fr_88px_72px_72px_80px]';
  const grid = mode === 'current' ? gridCurrent : gridHistorical;

  return (
    <div className="bg-slate-card border border-white/5 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-white/80">Rep Activity</h2>
        <span className="text-[10px] text-white/25 uppercase tracking-widest">{headerLabel}</span>
      </div>

      {/* Column headers */}
      {mode === 'current' ? (
        <div className={`grid ${grid} gap-x-2 items-center mb-1 px-2`}>
          <span className="text-[10px] text-white/25 uppercase tracking-widest">Rep</span>
          <span className="text-[10px] text-white/25 uppercase tracking-widest text-center">Open</span>
          <span className="text-[10px] text-white/25 uppercase tracking-widest text-center">Overdue</span>
          <span className="text-[10px] text-white/25 uppercase tracking-widest text-center">Due Today</span>
          <span className="text-[10px] text-white/25 uppercase tracking-widest text-center">Meetings</span>
          <span className="text-[10px] text-white/25 uppercase tracking-widest text-center">Attended</span>
        </div>
      ) : (
        <div className={`grid ${grid} gap-x-2 items-center mb-1 px-2`}>
          <span className="text-[10px] text-white/25 uppercase tracking-widest">Rep</span>
          <span className="text-[10px] text-white/25 uppercase tracking-widest text-center">Completed</span>
          <span className="text-[10px] text-white/25 uppercase tracking-widest text-center">Late</span>
          <span className="text-[10px] text-white/25 uppercase tracking-widest text-center">Meetings</span>
          <span className="text-[10px] text-white/25 uppercase tracking-widest text-center">Attended</span>
        </div>
      )}

      <div className="space-y-0.5">
        {activeReps.map((rep) => {
          const o = byOwner[rep.id];
          const { tasks = [], meetings = [], meetingsBooked = 0, meetingsAttended = 0 } = o;

          let attendedColor = 'text-white/30';
          if (meetingsBooked > 0) {
            if (meetingsAttended === meetingsBooked) attendedColor = 'text-green-400';
            else if (meetingsAttended > 0) attendedColor = 'text-yellow-400';
          }

          const openKey     = `${rep.id}:open`;
          const overdueKey  = `${rep.id}:overdue`;
          const dueTodayKey = `${rep.id}:dueToday`;
          const completedKey = `${rep.id}:completed`;
          const lateKey     = `${rep.id}:late`;
          const meetKey     = `${rep.id}:meetings`;

          // Which task list to show
          let visibleTasks = null;
          let taskLabel = '';
          if (mode === 'current') {
            if (expanded === openKey) {
              visibleTasks = tasks;
              taskLabel = `${o.openTasks} Open Task${o.openTasks !== 1 ? 's' : ''}`;
            } else if (expanded === overdueKey) {
              visibleTasks = tasks.filter((t) => t.isOverdue);
              taskLabel = `${o.overdueTasks} Overdue Task${o.overdueTasks !== 1 ? 's' : ''}`;
            } else if (expanded === dueTodayKey) {
              visibleTasks = tasks.filter((t) => t.isDueToday);
              taskLabel = `${o.dueTodayTasks} Due Today`;
            }
          } else {
            if (expanded === completedKey) {
              visibleTasks = tasks;
              taskLabel = `${o.completedTasks} Completed Task${o.completedTasks !== 1 ? 's' : ''}`;
            } else if (expanded === lateKey) {
              visibleTasks = tasks.filter((t) => t.isLate);
              taskLabel = `${o.lateTasks} Completed Late`;
            }
          }

          const showMeetings = expanded === meetKey;

          return (
            <React.Fragment key={rep.id}>
              <div className={`grid ${grid} gap-x-2 items-center rounded-lg px-2 py-1.5 bg-white/[0.02] hover:bg-white/[0.05] transition-colors`}>
                <span className="text-sm text-white/70 truncate">{rep.name}</span>

                {mode === 'current' ? (
                  <>
                    <div className="flex justify-center">
                      <StatBadge count={o.openTasks} type="open" repId={rep.id}
                        colorClass="bg-white/10 text-white/70"
                        emptyClass="bg-white/5 text-white/25" />
                    </div>
                    <div className="flex justify-center">
                      <StatBadge count={o.overdueTasks} type="overdue" repId={rep.id}
                        colorClass="bg-red-500/20 text-red-400"
                        emptyClass="bg-white/5 text-white/25" />
                    </div>
                    <div className="flex justify-center">
                      <StatBadge count={o.dueTodayTasks} type="dueToday" repId={rep.id}
                        colorClass="bg-amber-500/20 text-amber-400"
                        emptyClass="bg-white/5 text-white/25" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-center">
                      <StatBadge count={o.completedTasks} type="completed" repId={rep.id}
                        colorClass="bg-green-500/20 text-green-400"
                        emptyClass="bg-white/5 text-white/25" />
                    </div>
                    <div className="flex justify-center">
                      <StatBadge count={o.lateTasks} type="late" repId={rep.id}
                        colorClass="bg-red-500/20 text-red-400"
                        emptyClass="bg-white/5 text-white/25" />
                    </div>
                  </>
                )}

                <div className="flex justify-center">
                  <StatBadge count={meetingsBooked} type="meetings" repId={rep.id}
                    colorClass="bg-accent/20 text-accent"
                    emptyClass="bg-white/5 text-white/25" />
                </div>

                <div className="flex justify-center">
                  <span className={`text-xs tabular-nums font-medium ${attendedColor}`}>
                    {meetingsBooked > 0 ? `${meetingsAttended}/${meetingsBooked}` : '—'}
                  </span>
                </div>
              </div>

              {/* Task drill-down */}
              {visibleTasks && visibleTasks.length > 0 && (
                <div className="mx-2 mb-1 rounded-lg bg-white/[0.04] border border-white/5 overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-white/5 flex items-center justify-between">
                    <span className="text-[10px] text-white/40 uppercase tracking-widest">{taskLabel}</span>
                    <button onClick={() => setExpanded(null)} className="text-white/20 hover:text-white/50 text-xs">✕</button>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-white/5">
                    {visibleTasks.slice(0, 50).map((t) => {
                      const highlight = mode === 'current' ? t.isOverdue : t.isLate;
                      return (
                        <div key={t.id} className="flex items-center justify-between px-3 py-2 gap-3">
                          <span className={`text-xs truncate flex-1 ${highlight ? 'text-red-300' : 'text-white/60'}`}>
                            {highlight && <span className="text-red-400 mr-1">!</span>}
                            {t.subject}
                          </span>
                          {t.dueDate && (
                            <span className={`text-[10px] shrink-0 tabular-nums ${highlight ? 'text-red-400' : 'text-white/30'}`}>
                              {fmt(t.dueDate)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {visibleTasks.length > 50 && (
                      <div className="px-3 py-2 text-[10px] text-white/25 text-center">
                        Showing first 50 of {visibleTasks.length}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Meetings drill-down */}
              {showMeetings && meetings.length > 0 && (
                <div className="mx-2 mb-1 rounded-lg bg-white/[0.04] border border-white/5 overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-white/5 flex items-center justify-between">
                    <span className="text-[10px] text-white/40 uppercase tracking-widest">
                      {meetingsBooked} Meeting{meetingsBooked !== 1 ? 's' : ''}
                      {mode === 'current' ? ' This Week' : ` · ${data.periodLabel}`}
                    </span>
                    <button onClick={() => setExpanded(null)} className="text-white/20 hover:text-white/50 text-xs">✕</button>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-white/5">
                    {meetings.map((m) => (
                      <div key={m.id} className="flex items-center justify-between px-3 py-2 gap-3">
                        <span className="text-xs truncate flex-1 text-white/60">{m.title}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {m.startTime && (
                            <span className="text-[10px] text-white/30 tabular-nums">{fmt(m.startTime)}</span>
                          )}
                          {m.outcome && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              m.wentThrough ? 'bg-green-500/20 text-green-400'
                              : m.outcome === 'CANCELED' ? 'bg-red-500/20 text-red-400'
                              : m.outcome === 'NO_SHOW' ? 'bg-orange-500/20 text-orange-400'
                              : 'bg-white/10 text-white/40'
                            }`}>
                              {m.outcome.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
