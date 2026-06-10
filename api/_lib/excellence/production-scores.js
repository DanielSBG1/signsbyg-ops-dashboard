// api/_lib/excellence/production-scores.js
import { buildProductionMetrics } from '../production/metrics.js';
import { rateScore, invertedRateScore, timeScore, weightedScore, kpi } from './scoring.js';

export async function computeProductionOperationalScore() {
  const metrics  = await buildProductionMetrics();
  const { totals, jobs } = metrics;

  const today = new Date().toISOString().slice(0, 10);

  const activeJobs      = jobs.filter(j => !j.completed);
  const completedJobs   = jobs.filter(j => j.completed);
  const totalTracked    = jobs.length;

  // 1. On-time completion rate: on_track jobs / all active
  const onTrackCount  = activeJobs.filter(j => j.status === 'on_track').length;
  const onTimeRate    = activeJobs.length > 0 ? onTrackCount / activeJobs.length : 1;

  // 2. Rework/redo rate: jobs with a detected redo / total
  const redoRate = totalTracked > 0 ? (totals.redos ?? 0) / totalTracked : 0;

  // 3. First-pass quality rate: jobs with no redo at all / total
  const firstPassRate = totalTracked > 0 ? (totalTracked - (totals.redos ?? 0)) / totalTracked : 1;

  // 4. Dept-level on-time: average on-time rate across 4 departments
  const deptKeys = ['channel_letters', 'fabrication', 'vinyl_fco', 'outsourced'];
  const deptRates = deptKeys.map(key => {
    const deptJobs = jobs.filter(j => j.department === key && !j.completed);
    if (deptJobs.length === 0) return 1;
    return deptJobs.filter(j => j.status === 'on_track').length / deptJobs.length;
  });
  const avgDeptOnTimeRate = deptRates.reduce((s, r) => s + r, 0) / deptRates.length;

  // 5. Average cycle time: days from creation to completion for completed jobs
  const completedWithDates = completedJobs.filter(j => j.createdAt && j.completedAt);
  const avgCycleDays = completedWithDates.length > 0
    ? completedWithDates.reduce((s, j) => {
        const days = (new Date(j.completedAt) - new Date(j.createdAt)) / 86_400_000;
        return s + days;
      }, 0) / completedWithDates.length
    : 10; // assume 10 days if no data

  // 6. Seriously past due: active jobs past due > 3 days / total active
  const threeDaysAgo     = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const seriouslyLate    = activeJobs.filter(j => j.due_on && j.due_on < threeDaysAgo).length;
  const seriouslyLateRate = activeJobs.length > 0 ? seriouslyLate / activeJobs.length : 0;

  const kpis = [
    kpi('onTimeRate',        'On-Time Completion',      rateScore(onTimeRate),                     `${Math.round(onTimeRate * 100)}%`,        0.20),
    kpi('redoRate',          'Rework Rate',             invertedRateScore(redoRate, 0.08),          `${Math.round(redoRate * 100)}%`,          0.25),
    kpi('firstPassQuality',  'First-Pass Quality',      rateScore(firstPassRate),                  `${Math.round(firstPassRate * 100)}%`,     0.20),
    kpi('deptOnTimeAvg',     'Dept Avg On-Time',        rateScore(avgDeptOnTimeRate),              `${Math.round(avgDeptOnTimeRate * 100)}%`, 0.15),
    kpi('avgCycleTime',      'Avg Cycle Time',          timeScore(avgCycleDays, 5, 21),            `${Math.round(avgCycleDays)}d`,            0.10),
    kpi('seriouslyLateRate', 'Jobs 3+ Days Overdue',    invertedRateScore(seriouslyLateRate, 0.05), `${seriouslyLate} jobs`,                  0.10),
  ];

  return { score: weightedScore(kpis), kpis };
}
