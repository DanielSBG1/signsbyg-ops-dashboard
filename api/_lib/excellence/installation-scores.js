// api/_lib/excellence/installation-scores.js
import { getCached } from '../cache.js';
import { rateScore, invertedRateScore, weightedScore, kpi } from './scoring.js';

const CACHE_KEY = 'installation:metrics:v1';

export async function computeInstallationOperationalScore() {
  const data = await getCached(CACHE_KEY);

  // If cache is cold (no cron has run yet), return a neutral score with a flag.
  if (!data) {
    return {
      score: 50,
      kpis: [],
      dataUnavailable: true,
    };
  }

  const { jobs = [], byCrew = [] } = data;

  const completedJobs = jobs.filter(j => j.completed);
  const total         = jobs.length;

  // 1. On-time install rate: (early + on_time) / completed
  const onTimeCount = completedJobs.filter(j => j.status === 'early' || j.status === 'on_time').length;
  const onTimeRate  = completedJobs.length > 0 ? onTimeCount / completedJobs.length : 1;

  // 2. Crew scorecard average: mean onTimeRate across active crews (onTimeRate is 0–100)
  const activeCrew  = byCrew.filter(c => c.completed > 0);
  const avgCrewRate = activeCrew.length > 0
    ? activeCrew.reduce((s, c) => s + c.onTimeRate, 0) / activeCrew.length / 100
    : onTimeRate;

  // 3. Reschedule rate: weighted — 1x = 0.5 weight, 2x+ = 1.5 weight
  const rescheduled1x    = jobs.filter(j => j.rescheduleCount === 1).length;
  const rescheduledMulti = jobs.filter(j => (j.rescheduleCount ?? 0) >= 2).length;
  const weightedReschedules = (rescheduled1x * 0.5 + rescheduledMulti * 1.5);
  const rescheduleRate = total > 0 ? weightedReschedules / total : 0;

  // 4. Bled-over rate
  const bledOver     = jobs.filter(j => j.status === 'bled_over').length;
  const bledOverRate = total > 0 ? bledOver / total : 0;

  // 5. At-risk rate: jobs currently flagged at_risk
  const atRisk     = jobs.filter(j => j.status === 'at_risk').length;
  const atRiskRate = total > 0 ? atRisk / total : 0;

  // 6. Intake completeness: jobs with crews + installDate + pm assigned
  const completeIntake = jobs.filter(j =>
    (j.crews?.length ?? 0) > 0 && j.installDate && j.pm
  ).length;
  const intakeRate = total > 0 ? completeIntake / total : 1;

  const kpis = [
    kpi('onTimeRate',     'On-Time Install Rate',  rateScore(onTimeRate),                      `${Math.round(onTimeRate * 100)}%`,           0.20),
    kpi('crewScorecard',  'Crew Scorecard Avg',    rateScore(avgCrewRate),                     `${Math.round(avgCrewRate * 100)}%`,          0.20),
    kpi('rescheduleRate', 'Reschedule Rate',       invertedRateScore(rescheduleRate, 0.15),    `${rescheduled1x}×1, ${rescheduledMulti}×2+`, 0.20),
    kpi('bledOverRate',   'Bled-Over Rate',        invertedRateScore(bledOverRate, 0.10),      `${bledOver} jobs`,                           0.15),
    kpi('atRiskRate',     'At-Risk Rate',          invertedRateScore(atRiskRate, 0.10),        `${atRisk} jobs`,                             0.15),
    kpi('intakeComplete', 'Intake Completeness',   rateScore(intakeRate),                      `${Math.round(intakeRate * 100)}%`,           0.10),
  ];

  return { score: weightedScore(kpis), kpis };
}
