// src/utils/health.js
// Pure functions — no React, no API imports.

export const BAND_CONFIG = {
  healthy: {
    label: 'Healthy',
    textClass: 'text-success',
    borderClass: 'border-success/40',
    fillClass: 'bg-success',
    badgeBgClass: 'bg-success/20',
    badgeBgHoverClass: 'hover:bg-success/30',
  },
  watch: {
    label: 'Watch',
    textClass: 'text-yellow-400',
    borderClass: 'border-yellow-400/40',
    fillClass: 'bg-yellow-400',
    badgeBgClass: 'bg-yellow-400/20',
    badgeBgHoverClass: 'hover:bg-yellow-400/30',
  },
  at_risk: {
    label: 'At Risk',
    textClass: 'text-orange-400',
    borderClass: 'border-orange-400/40',
    fillClass: 'bg-orange-400',
    badgeBgClass: 'bg-orange-400/20',
    badgeBgHoverClass: 'hover:bg-orange-400/30',
  },
  critical: {
    label: 'Critical',
    textClass: 'text-danger',
    borderClass: 'border-danger/40',
    fillClass: 'bg-danger',
    badgeBgClass: 'bg-danger/20',
    badgeBgHoverClass: 'hover:bg-danger/30',
  },
  no_data: {
    label: '—',
    textClass: 'text-white/30',
    borderClass: 'border-white/10',
    fillClass: 'bg-white/10',
    badgeBgClass: 'bg-white/10',
    badgeBgHoverClass: 'hover:bg-white/15',
  },
};

const BAND_ORDER = ['critical', 'at_risk', 'watch', 'healthy', 'no_data'];

export function scoreToBand(score) {
  if (score === null) return 'no_data';
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'watch';
  if (score >= 40) return 'at_risk';
  return 'critical';
}

/**
 * Compute health score for a single production job.
 * @param {object} job - job record from /api/production-metrics
 * @param {string} today - ISO date string YYYY-MM-DD (optional, defaults to current date)
 * @returns {{ score: number|null, band: string }}
 */
export function computeProductionHealth(job, today = new Date().toISOString().slice(0, 10)) {
  const { status, projectedLate, redoType, subTasks = [] } = job;

  // no_date with no sub-sub-tasks → no data
  if (status === 'no_date' && subTasks.length === 0) {
    return { score: null, band: 'no_data' };
  }

  let score = 100;

  if (status === 'late') score -= 35;
  if (projectedLate) score -= 15;
  if (redoType === 'production') score -= 20;
  else if (redoType === 'pm_sales') score -= 10;

  // overdue sub-sub-tasks: -5 each, capped at -20
  const overdueCount = subTasks.filter(
    s => !s.completed && s.due_on && s.due_on < today
  ).length;
  score -= Math.min(overdueCount * 5, 20);

  score = Math.max(0, score);

  return { score, band: scoreToBand(score) };
}

/**
 * Average health score across jobs that have a non-null score.
 * @param {Array<{ _health: { score: number|null } }>} jobs
 * @returns {number|null}
 */
export function avgHealth(jobs) {
  const scoreable = jobs.filter(j => j._health?.score !== null && j._health?.score !== undefined);
  if (scoreable.length === 0) return null;
  const sum = scoreable.reduce((acc, j) => acc + j._health.score, 0);
  return Math.round(sum / scoreable.length);
}

/**
 * Sort jobs by health band (critical first) then by due_on ascending.
 * @param {Array} jobs - jobs with _health property attached
 * @returns {Array}
 */
export function sortByHealth(jobs) {
  return [...jobs].sort((a, b) => {
    const bandA = BAND_ORDER.indexOf(a._health.band);
    const bandB = BAND_ORDER.indexOf(b._health.band);
    if (bandA !== bandB) return bandA - bandB;
    // within same band: due_on ascending (null last)
    if (!a.due_on && !b.due_on) return 0;
    if (!a.due_on) return 1;
    if (!b.due_on) return -1;
    return a.due_on < b.due_on ? -1 : a.due_on > b.due_on ? 1 : 0;
  });
}
