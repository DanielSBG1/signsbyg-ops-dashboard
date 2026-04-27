import React, { useEffect } from 'react';

const STATUS_CONFIG = {
  late:     { label: 'Late',     className: 'text-danger' },
  on_track: { label: 'On Track', className: 'text-success' },
  no_date:  { label: 'No Date',  className: 'text-white/40' },
};

const REDO_LABELS = {
  production: 'Production Fault',
  pm_sales:   'PM / Sales Error',
};

function SubtaskRow({ name, assignee, due_on, completed, today }) {
  const isOverdue = !completed && due_on && due_on < today;
  return (
    <div className="flex items-center gap-3 text-xs py-2 border-b border-white/[0.04] last:border-0">
      {completed ? (
        <span className="text-success text-sm shrink-0">✓</span>
      ) : (
        <span className="w-2 h-2 rounded-full bg-white/20 inline-block shrink-0" />
      )}
      <span className={`flex-1 truncate ${completed ? 'text-white/30 line-through' : 'text-white/80'}`}>
        {name}
      </span>
      <span className="text-white/30 text-[10px] shrink-0">{assignee ?? '—'}</span>
      {due_on ? (
        <span className={`text-[10px] tabular-nums shrink-0 ${isOverdue ? 'text-danger font-semibold' : 'text-white/30'}`}>
          {due_on}
        </span>
      ) : (
        <span className="text-[10px] text-white/20 shrink-0">no date</span>
      )}
    </div>
  );
}

export default function JobDrawer({ job, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  const status = STATUS_CONFIG[job.status];

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-slate-card border-l border-white/10 z-50 overflow-y-auto shadow-2xl">
        <div className="p-6 space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-base font-semibold leading-snug">{job.name}</h2>
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white text-xl shrink-0 mt-0.5"
            >
              ×
            </button>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap gap-5">
            <div>
              <p className="text-white/40 text-xs">Production Due</p>
              <p className={`text-sm font-semibold ${job.status === 'late' ? 'text-danger' : 'text-white'}`}>
                {job.due_on ?? 'No date set'}
              </p>
            </div>
            <div>
              <p className="text-white/40 text-xs">Status</p>
              <p className={`text-sm font-semibold ${status.className}`}>{status.label}</p>
            </div>
            {job.projectedLate && (
              <div>
                <p className="text-white/40 text-xs">Projection</p>
                <p className="text-sm font-semibold text-warning">⚠ Projected Late</p>
              </div>
            )}
            {job.redoType && (
              <div>
                <p className="text-white/40 text-xs">Redo Type</p>
                <p className="text-sm font-semibold text-orange-400">{REDO_LABELS[job.redoType]}</p>
              </div>
            )}
          </div>

          {/* Sub-sub-task list */}
          <div>
            <p className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3">
              Production Stages
            </p>
            {job.subTasks.length === 0 ? (
              <p className="text-white/20 text-sm">No stages found</p>
            ) : (
              job.subTasks.map(s => (
                <SubtaskRow key={s.gid} {...s} today={today} />
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
