// api/_lib/excellence/pm-scores.js
import { buildPmMetrics } from '../pm/metrics.js';
import { rateScore, invertedRateScore, weightedScore, kpi } from './scoring.js';

export async function computePmOperationalScore() {
  const metrics = await buildPmMetrics();
  const { totals, scorecards, departmentLoad } = metrics;

  const today        = new Date().toISOString().slice(0, 10);
  const sevenAgo     = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // 1. Task on-time rate: subtasks not overdue / total subtasks with due dates
  const allTasks       = Object.values(departmentLoad).flatMap(d => d.tasks ?? []);
  const withDue        = allTasks.filter(t => t.due_on);
  const overdueCount   = withDue.filter(t => !t.completed && t.due_on < today).length;
  const taskOnTimeRate = withDue.length > 0 ? 1 - overdueCount / withDue.length : 1;

  // 2. Job health score: average score across active jobs (already 0–100)
  const avgHealth = scorecards.length > 0
    ? scorecards.reduce((s, j) => s + j.score, 0) / scorecards.length
    : 100;

  // 3. Overdue subtask rate (proxy for promise date changes — story-based tracking is V2)
  const overdueRate = withDue.length > 0 ? overdueCount / withDue.length : 0;

  // 4. Stuck job rate: jobs with no modified_at in last 7 days
  const stuckCount   = scorecards.filter(j => j.modified_at && j.modified_at.slice(0, 10) < sevenAgo).length;
  const stuckRate    = scorecards.length > 0 ? stuckCount / scorecards.length : 0;

  // 5. Job setup completeness: jobs that have a due_on set
  const withDueJob         = scorecards.filter(j => j.due_on).length;
  const setupCompletion    = scorecards.length > 0 ? withDueJob / scorecards.length : 1;

  // 6. On-track rate (milestone adherence proxy): healthy band jobs / active
  const onTrackRate = totals.active > 0 ? totals.onTrack / totals.active : 1;

  const kpis = [
    kpi('taskOnTimeRate',     'Task On-Time Rate',      rateScore(taskOnTimeRate),              `${Math.round(taskOnTimeRate * 100)}%`,      0.20),
    kpi('jobHealthScore',     'Job Health Score',        Math.min(100, Math.max(0, Math.round(avgHealth))),   `${Math.round(avgHealth)}/100`,              0.15),
    kpi('overdueSubtaskRate', 'Overdue Subtask Rate',    invertedRateScore(overdueRate, 0.10),   `${Math.round(overdueRate * 100)}%`,         0.20),
    kpi('stuckJobRate',       'Stuck Job Rate',          invertedRateScore(stuckRate, 0.10),     `${Math.round(stuckRate * 100)}%`,           0.15),
    kpi('jobSetupComplete',   'Job Setup Completeness',  rateScore(setupCompletion),             `${Math.round(setupCompletion * 100)}%`,     0.15),
    kpi('onTrackRate',        'On-Track Rate',           rateScore(onTrackRate),                 `${Math.round(onTrackRate * 100)}%`,         0.15),
  ];

  return { score: weightedScore(kpis), kpis };
}
