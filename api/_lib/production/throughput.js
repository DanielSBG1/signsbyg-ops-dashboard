import { PRODUCTION_PROJECT_GID, THROUGHPUT_FIELDS } from './constants.js';
import { getTasksCompletedSince } from './asana.js';

/**
 * Classifies a completed task as on_time or late.
 * @param {string|null} completedAt  ISO datetime string
 * @param {string|null} dueOn        YYYY-MM-DD
 * @returns {'on_time'|'late'}
 */
export function classifyCompletion(completedAt, dueOn) {
  if (!dueOn || !completedAt) return 'on_time';
  // Compare date portion only
  return completedAt.slice(0, 10) <= dueOn ? 'on_time' : 'late';
}

/**
 * Groups classified tasks into 4 Monday-Sunday week buckets.
 * Index 0 = current week, index 3 = 3 weeks ago.
 * @param {Array<{completedAt: string, classification: 'on_time'|'late'}>} tasks
 * @param {Date} referenceDate  defaults to now; override for testing
 * @returns {Array<{label: string, onTime: number, late: number}>}
 */
export function bucketByWeek(tasks, referenceDate = new Date()) {
  const weeks = [];

  for (let w = 0; w <= 3; w++) {
    // Find Monday of the week that is `w` weeks before referenceDate
    const monday = new Date(referenceDate);
    const dow = monday.getUTCDay(); // 0=Sun, 1=Mon, ...
    const daysToMonday = dow === 0 ? -6 : 1 - dow;
    monday.setUTCDate(monday.getUTCDate() + daysToMonday - w * 7);
    monday.setUTCHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);

    const weekTasks = tasks.filter(t => {
      const d = new Date(t.completedAt);
      return d >= monday && d <= sunday;
    });

    const monLabel = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const sunLabel = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

    weeks.push({
      label: `${monLabel}–${sunLabel}`,
      onTime: weekTasks.filter(t => t.classification === 'on_time').length,
      late: weekTasks.filter(t => t.classification === 'late').length,
    });
  }

  return weeks;
}

/**
 * Fetches completed production sub-tasks from the last 28 days and
 * buckets them by week with on-time vs late classification.
 */
export async function buildThroughput() {
  const twentyEightDaysAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  const allTasks = await getTasksCompletedSince(
    PRODUCTION_PROJECT_GID,
    twentyEightDaysAgo,
    THROUGHPUT_FIELDS,
  );

  // Filter to completed-only (getTasksCompletedSince also returns incomplete tasks)
  const completedTasks = allTasks.filter(t => t.completed && t.completed_at);

  const classified = completedTasks.map(t => ({
    completedAt: t.completed_at,
    classification: classifyCompletion(t.completed_at, t.due_on ?? null),
  }));

  const weeks = bucketByWeek(classified);

  const totalOnTime = weeks.reduce((s, w) => s + w.onTime, 0);
  const totalLate = weeks.reduce((s, w) => s + w.late, 0);
  const total = totalOnTime + totalLate;
  const onTimeRate = total > 0 ? Math.round((totalOnTime / total) * 100) : null;

  return { weeks, onTimeRate };
}
