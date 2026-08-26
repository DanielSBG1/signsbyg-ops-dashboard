import React, { useMemo, useState } from 'react';

const DEPT_ORDER = ['design', 'permitting', 'production', 'installation', 'invoicing'];

function healthBarColor(score) {
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

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr) - Date.now()) / 86400000);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

/**
 * Compute 0–100 on-time probability for a job.
 * 100 = extremely likely on time, 0 = almost certainly late.
 */
function computeOnTimeScore(sc, auditTask) {
  // Already fully complete → certain on time
  const stagesDone = (sc.subtasks ?? []).filter(s => s.completed).length;
  if (stagesDone === DEPT_ORDER.length) return 100;

  // Start from health score (accounts for comments, REDO, overdue subtasks)
  let score = sc.score;

  // Due date risk
  const days = daysUntil(sc.due_on);
  if (days !== null) {
    if (days < 0)   score = Math.min(score, 35);  // already past due
    else if (days < 3)  score -= 20;
    else if (days < 7)  score -= 10;
    else if (days < 14) score -= 5;
    // Plenty of time and good progress → small bonus
    else if (days > 30 && stagesDone >= 3) score += 8;
  }

  // Overdue subtask penalty (on top of health score)
  if (sc.hasOverdueSubtask) score -= 12;

  // Audit flag penalty
  if (auditTask?.flag === 'urgent') score -= 18;
  else if (auditTask?.flag === 'red') score -= 10;
  else if (auditTask?.flag === 'yellow') score -= 3;

  // Stage completion progress bonus
  score += stagesDone * 2; // 0–10 bonus for stages done

  return Math.max(0, Math.min(100, Math.round(score)));
}

function ScoreBar({ score }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-black/[0.05] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, backgroundColor: healthBarColor(score) }}
        />
      </div>
      <span
        className="text-xs font-bold tabular-nums w-8 text-right"
        style={{ color: healthBarColor(score) }}
      >
        {score}
      </span>
    </div>
  );
}

function StageProgress({ subtasks }) {
  const done = (subtasks ?? []).filter(s => s.completed).length;
  const total = DEPT_ORDER.length;
  return (
    <div className="flex items-center gap-1">
      {DEPT_ORDER.map((dept, i) => {
        const sub = (subtasks ?? []).find(s => s.department === dept);
        const isComplete = sub?.completed ?? false;
        const colors = {
          design: '#3b82f6', permitting: '#a855f7', production: '#f97316',
          installation: '#eab308', invoicing: '#22c55e',
        };
        return (
          <div
            key={dept}
            title={`${dept[0].toUpperCase() + dept.slice(1)}: ${isComplete ? 'done' : 'pending'}`}
            className="w-3 h-3 rounded-sm transition-all"
            style={{
              backgroundColor: isComplete ? colors[dept] : 'rgba(255,255,255,0.08)',
              border: isComplete ? 'none' : '1px solid rgba(255,255,255,0.12)',
            }}
          />
        );
      })}
      <span className="text-[10px] text-gray-300 ml-1">{done}/{total}</span>
    </div>
  );
}

export default function OnTimeTab({ data, auditData }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'at-risk' | 'on-track'
  const [sortBy, setSortBy] = useState('score'); // 'score' | 'due' | 'pm'

  // Build GID → audit task + PM name lookup
  const auditMap = useMemo(() => {
    const map = {};
    if (!auditData?.pms) return map;
    for (const pm of auditData.pms) {
      for (const task of pm.tasks) {
        map[task.gid] = { task, pmName: pm.name };
      }
    }
    return map;
  }, [auditData]);

  // Build scored job list
  const jobs = useMemo(() => {
    if (!data?.scorecards) return [];
    return data.scorecards.map(sc => {
      const audit = auditMap[sc.gid];
      const onTimeScore = computeOnTimeScore(sc, audit?.task);
      const stagesDone = (sc.subtasks ?? []).filter(s => s.completed).length;
      const days = daysUntil(sc.due_on);
      return {
        gid: sc.gid,
        name: sc.name,
        pmName: audit?.pmName ?? '—',
        healthScore: sc.score,
        onTimeScore,
        stagesDone,
        subtasks: sc.subtasks ?? [],
        due_on: sc.due_on,
        daysLeft: days,
        hasOverdueSubtask: sc.hasOverdueSubtask,
        flag: audit?.task?.flag ?? null,
      };
    });
  }, [data, auditMap]);

  const filtered = useMemo(() => {
    let list = jobs;
    if (filter === 'at-risk') list = list.filter(j => j.onTimeScore < 60);
    if (filter === 'on-track') list = list.filter(j => j.onTimeScore >= 70);
    if (sortBy === 'score') return [...list].sort((a, b) => a.onTimeScore - b.onTimeScore);
    if (sortBy === 'due') return [...list].sort((a, b) => {
      if (!a.due_on && !b.due_on) return 0;
      if (!a.due_on) return 1;
      if (!b.due_on) return -1;
      return a.due_on < b.due_on ? -1 : 1;
    });
    if (sortBy === 'pm') return [...list].sort((a, b) => a.pmName.localeCompare(b.pmName));
    return list;
  }, [jobs, filter, sortBy]);

  // Summary counts
  const atRisk   = jobs.filter(j => j.onTimeScore < 50).length;
  const watch    = jobs.filter(j => j.onTimeScore >= 50 && j.onTimeScore < 70).length;
  const onTrack  = jobs.filter(j => j.onTimeScore >= 70).length;

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-300 text-sm">Loading data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-red-500/20 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{atRisk}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-1">At Risk · Score &lt;50</p>
        </div>
        <div className="bg-white border border-yellow-500/20 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">{watch}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-1">Watch · Score 50–69</p>
        </div>
        <div className="bg-white border border-green-500/20 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-400">{onTrack}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-1">On Track · Score ≥70</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-black/[0.03] rounded-lg p-1">
          {[['all', 'All Jobs'], ['at-risk', 'At Risk'], ['on-track', 'On Track']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                filter === val ? 'bg-black/[0.05] text-gray-900' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          Sort:
          {[['score', 'Score'], ['due', 'Due Date'], ['pm', 'PM']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setSortBy(val)}
              className={`px-2 py-1 rounded transition-colors ${
                sortBy === val ? 'text-gray-900 bg-black/[0.05]' : 'hover:text-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_80px_140px_100px_130px] gap-4 px-4 text-[10px] text-gray-300 uppercase tracking-wider">
        <span>Job</span>
        <span>PM</span>
        <span>Stage Progress</span>
        <span>Due Date</span>
        <span>On-Time Score</span>
      </div>

      {/* Job rows */}
      <div className="space-y-1.5">
        {filtered.map(job => {
          const duePast = job.daysLeft !== null && job.daysLeft < 0;
          const dueSoon = job.daysLeft !== null && job.daysLeft >= 0 && job.daysLeft <= 7;
          return (
            <div
              key={job.gid}
              className="grid grid-cols-[1fr_80px_140px_100px_130px] gap-4 items-center bg-white border border-gray-200 rounded-xl px-4 py-3"
            >
              {/* Name */}
              <p className="text-sm text-gray-900 truncate" title={job.name}>{job.name}</p>

              {/* PM */}
              <p className="text-xs text-gray-500 truncate">{job.pmName}</p>

              {/* Stage progress dots */}
              <StageProgress subtasks={job.subtasks} />

              {/* Due date */}
              <div>
                <p className={`text-xs tabular-nums ${duePast ? 'text-red-400 font-semibold' : dueSoon ? 'text-yellow-400' : 'text-gray-500'}`}>
                  {formatDate(job.due_on)}
                </p>
                {job.daysLeft !== null && (
                  <p className="text-[10px] text-gray-300">
                    {job.daysLeft < 0
                      ? `${Math.abs(job.daysLeft)}d overdue`
                      : `${job.daysLeft}d left`}
                  </p>
                )}
              </div>

              {/* On-time score bar */}
              <ScoreBar score={job.onTimeScore} />
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-10 text-gray-300 text-sm">No jobs match this filter.</div>
        )}
      </div>
    </div>
  );
}
