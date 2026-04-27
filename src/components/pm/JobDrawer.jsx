import React, { useEffect, useState } from 'react';
import HealthBadge from './HealthBadge';

const DEPT_ORDER = ['design', 'permitting', 'production', 'installation', 'invoicing'];
const DEPT_LABELS = {
  design: 'Design',
  permitting: 'Permitting',
  production: 'Production',
  installation: 'Installation',
  invoicing: 'Invoicing',
};

function StatusIcon({ completed }) {
  if (completed) return <span className="text-success text-sm">✓</span>;
  return <span className="w-2 h-2 rounded-full bg-accent inline-block" />;
}

function NotStartedIcon() {
  return <span className="w-2 h-2 rounded-full border border-white/20 inline-block" />;
}

export default function JobDrawer({ gid, onClose }) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setJob(null);
    setError(null);
    fetch(`/api/pm-job/${gid}`)
      .then(r => r.json())
      .then(json => {
        if (!json.ok) throw new Error(json.error);
        setJob(json.data);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [gid]);

  // Close on Escape key
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Group subtasks by department for ordered display
  const subtaskByDept = job
    ? Object.fromEntries(job.subtasks.map(s => [s.department, s]))
    : {};

  const today = new Date().toISOString().slice(0, 10);

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
            <h2 className="text-base font-semibold leading-snug">
              {loading ? 'Loading...' : (job?.name ?? 'Job Drill-Down')}
            </h2>
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white text-xl shrink-0 mt-0.5"
            >
              ×
            </button>
          </div>

          {loading && <p className="text-white/40 text-sm">Fetching job data...</p>}
          {error && <p className="text-red-400 text-sm">Error: {error}</p>}

          {job && (
            <>
              {/* Score + due date */}
              <div className="flex items-center gap-4">
                <HealthBadge score={job.score} band={job.band} size="lg" />
                <div>
                  <p className="text-white/40 text-xs">Client promise date</p>
                  <p className={`text-sm font-semibold ${
                    job.due_on && job.due_on < today ? 'text-red-400' : 'text-white'
                  }`}>
                    {job.due_on ?? 'No due date set'}
                  </p>
                </div>
              </div>

              {/* Penalties */}
              {job.penalties.length > 0 && (
                <div className="bg-white/[0.03] rounded-xl p-4 space-y-2">
                  <p className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3">Score Breakdown</p>
                  {job.penalties.map((p, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-xs text-white/70">{p.label}</span>
                      <span className="text-xs text-red-400 font-semibold tabular-nums">{p.points}</span>
                    </div>
                  ))}
                  <div className="border-t border-white/10 pt-2 flex justify-between">
                    <span className="text-xs text-white/50">Total score</span>
                    <span className="text-xs font-bold tabular-nums">{job.score}</span>
                  </div>
                </div>
              )}

              {/* Department timeline */}
              <div>
                <p className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3">Department Timeline</p>
                <div className="space-y-2">
                  {DEPT_ORDER.map(dept => {
                    const sub = subtaskByDept[dept];
                    if (!sub) {
                      return (
                        <div key={dept} className="flex items-center gap-3 py-2 opacity-30">
                          <NotStartedIcon />
                          <span className="text-xs text-white/40">{DEPT_LABELS[dept]}</span>
                          <span className="text-[10px] text-white/20 ml-auto">not started</span>
                        </div>
                      );
                    }
                    const isOverdueSub = sub.due_on && sub.due_on < today;
                    return (
                      <div key={dept} className="flex items-start gap-3 py-2 border-b border-white/[0.04] last:border-0">
                        <div className="mt-0.5">
                          <StatusIcon completed={sub.completed} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">{DEPT_LABELS[dept]}</span>
                            {sub.name.toUpperCase().includes('REDO') && (
                              <span className="text-orange-400 text-[10px] font-bold">REDO</span>
                            )}
                          </div>
                          <p className="text-white/40 text-[10px]">
                            {sub.assignee ?? 'Unassigned'}
                          </p>
                          {(dept === 'design' || dept === 'permitting') && sub.commentCount != null && (
                            <p className={`text-[10px] ${
                              (dept === 'design' && sub.commentCount > 6) ||
                              (dept === 'permitting' && sub.commentCount > 15)
                                ? 'text-orange-400'
                                : 'text-white/30'
                            }`}>
                              {sub.commentCount} comments
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          {sub.due_on ? (
                            <span className={`text-[10px] tabular-nums ${isOverdueSub ? 'text-red-400 font-semibold' : 'text-white/40'}`}>
                              {sub.due_on}
                            </span>
                          ) : (
                            <span className="text-[10px] text-white/20">no date</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Production sub-subtasks */}
              {job.productionSubtasks.length > 0 && (
                <div>
                  <p className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3">Production Stages</p>
                  <div className="space-y-1.5">
                    {job.productionSubtasks.map(s => {
                      const isOver = s.due_on && s.due_on < today;
                      return (
                        <div key={s.gid} className="flex items-center gap-3 text-xs">
                          <StatusIcon completed={s.completed} />
                          <span className="flex-1 text-white/70 truncate">{s.name}</span>
                          <span className="text-white/40 text-[10px]">{s.assignee ?? '—'}</span>
                          <span className={`text-[10px] tabular-nums ${isOver ? 'text-red-400' : 'text-white/30'}`}>
                            {s.due_on ?? '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
