import { HEALTH_WEIGHTS, COMMENT_THRESHOLDS, STALE_DAYS, SCORE_BANDS } from './constants.js';

export function isOnHold(task) {
  return task.name.toUpperCase().includes('ON HOLD');
}

export function isOverdue(due_on) {
  if (!due_on) return false;
  // Compare date strings only (strip time component from today)
  return due_on < new Date().toISOString().slice(0, 10);
}

export function daysSince(isoDate) {
  return (Date.now() - new Date(isoDate).getTime()) / 86_400_000;
}

/**
 * Computes a 0-100 health score for a job.
 * job = { mainTask: { name, due_on, modified_at }, subtasks: [{ department, name, due_on, completed, commentCount }] }
 */
export function computeHealthScore(job) {
  let score = 100;
  const activeSubtasks = job.subtasks.filter(s => !s.completed);

  // -8: main task due date missed (skipped if ON HOLD)
  if (!isOnHold(job.mainTask) && isOverdue(job.mainTask.due_on)) {
    score += HEALTH_WEIGHTS.mainTaskOverdue;
  }

  // -6: any REDO subtask
  if (activeSubtasks.some(s => s.name.toUpperCase().includes('REDO'))) {
    score += HEALTH_WEIGHTS.redoSubtask;
  }

  // -4: any subtask overdue (skipped if subtask is ON HOLD)
  if (activeSubtasks.some(s => !isOnHold(s) && isOverdue(s.due_on))) {
    score += HEALTH_WEIGHTS.subtaskOverdue;
  }

  // -3: stale — no modification in >STALE_DAYS days (skipped if ON HOLD)
  if (!isOnHold(job.mainTask) && daysSince(job.mainTask.modified_at) > STALE_DAYS) {
    score += HEALTH_WEIGHTS.stale;
  }

  // -2: high design comment count
  const designSub = activeSubtasks.find(s => s.department === 'design');
  if (designSub && (designSub.commentCount ?? 0) > COMMENT_THRESHOLDS.design) {
    score += HEALTH_WEIGHTS.highDesignComments;
  }

  // -2: high permitting comment count
  const permitSub = activeSubtasks.find(s => s.department === 'permitting');
  if (permitSub && (permitSub.commentCount ?? 0) > COMMENT_THRESHOLDS.permitting) {
    score += HEALTH_WEIGHTS.highPermittingComments;
  }

  // -1 per active subtask missing a due date
  const missingDueDates = activeSubtasks.filter(s => !s.due_on);
  score += HEALTH_WEIGHTS.missingDueDate * missingDueDates.length;

  return Math.max(0, Math.min(100, score));
}

/**
 * Returns 'healthy' | 'watch' | 'risk' | 'critical' for a given score.
 */
export function scoreBand(score) {
  if (score >= SCORE_BANDS.healthy) return 'healthy';
  if (score >= SCORE_BANDS.watch) return 'watch';
  if (score >= SCORE_BANDS.risk) return 'risk';
  return 'critical';
}

/**
 * Returns an array of { label, points } for each active penalty.
 * Used by the Job Drawer to explain the score.
 */
export function scorePenalties(job) {
  const penalties = [];
  const activeSubtasks = job.subtasks.filter(s => !s.completed);

  if (!isOnHold(job.mainTask) && isOverdue(job.mainTask.due_on)) {
    penalties.push({ label: 'Main task due date missed', points: HEALTH_WEIGHTS.mainTaskOverdue });
  }
  if (activeSubtasks.some(s => s.name.toUpperCase().includes('REDO'))) {
    penalties.push({ label: 'REDO subtask in flight', points: HEALTH_WEIGHTS.redoSubtask });
  }
  if (activeSubtasks.some(s => !isOnHold(s) && isOverdue(s.due_on))) {
    penalties.push({ label: 'Subtask overdue', points: HEALTH_WEIGHTS.subtaskOverdue });
  }
  if (!isOnHold(job.mainTask) && daysSince(job.mainTask.modified_at) > STALE_DAYS) {
    const d = Math.floor(daysSince(job.mainTask.modified_at));
    penalties.push({ label: `Stale — no activity in ${d} days`, points: HEALTH_WEIGHTS.stale });
  }
  const designSub = activeSubtasks.find(s => s.department === 'design');
  if (designSub && (designSub.commentCount ?? 0) > COMMENT_THRESHOLDS.design) {
    penalties.push({ label: `High Design comments (${designSub.commentCount})`, points: HEALTH_WEIGHTS.highDesignComments });
  }
  const permitSub = activeSubtasks.find(s => s.department === 'permitting');
  if (permitSub && (permitSub.commentCount ?? 0) > COMMENT_THRESHOLDS.permitting) {
    penalties.push({ label: `High Permitting comments (${permitSub.commentCount})`, points: HEALTH_WEIGHTS.highPermittingComments });
  }
  const missing = activeSubtasks.filter(s => !s.due_on);
  if (missing.length > 0) {
    penalties.push({ label: `${missing.length} subtask(s) missing due date`, points: HEALTH_WEIGHTS.missingDueDate * missing.length });
  }
  return penalties;
}
