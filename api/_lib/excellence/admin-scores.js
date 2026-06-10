// api/_lib/excellence/admin-scores.js
import { buildPmMetrics } from '../pm/metrics.js';
import { rateScore, invertedRateScore, weightedScore, kpi } from './scoring.js';

/**
 * @param {{ pm: number, production: number, installation: number }} opScores
 *   The operational scores (0–100) already computed for other teams.
 */
export async function computeAdminOperationalScore({ pm, production, installation }) {
  const metrics = await buildPmMetrics(); // reuses cached data (same process call)
  const { totals, scorecards } = metrics;

  // 1. Company on-time average: mean of PM + Production + Installation scores
  //    Higher is better — treated as a rate out of 100.
  const companyOnTimeAvg = (pm + production + installation) / 3 / 100;

  // 2. Job setup completeness: % active PM jobs with due_on set
  const withDue         = scorecards.filter(j => j.due_on).length;
  const setupRate       = scorecards.length > 0 ? withDue / scorecards.length : 1;

  // 3. Process adherence proxy: on-track rate across PM jobs
  //    (Full process adherence tracking requires workflow audit — V2 enhancement)
  const onTrackRate = totals.active > 0 ? totals.onTrack / totals.active : 1;

  // 4. No-date job rate (inverted): jobs missing due_on
  const noDueDateRate = scorecards.length > 0
    ? (scorecards.length - withDue) / scorecards.length
    : 0;

  // 5. Critical job rate (inverted): jobs in critical health band
  const criticalRate = totals.active > 0 ? (totals.critical ?? 0) / totals.active : 0;

  const kpis = [
    kpi('companyOnTimeAvg', 'Company On-Time Avg',    rateScore(companyOnTimeAvg),            `${Math.round(companyOnTimeAvg * 100)}%`, 0.30),
    kpi('jobSetupComplete', 'Job Setup Completeness',  rateScore(setupRate),                   `${Math.round(setupRate * 100)}%`,        0.25),
    kpi('processAdherence', 'Process Adherence',       rateScore(onTrackRate),                 `${Math.round(onTrackRate * 100)}%`,      0.25),
    kpi('noDueDateRate',    'No Due Date Rate',        invertedRateScore(noDueDateRate, 0.10), `${Math.round(noDueDateRate * 100)}%`,    0.10),
    kpi('criticalJobRate',  'Critical Job Rate',       invertedRateScore(criticalRate, 0.10),  `${totals.critical ?? 0} jobs`,           0.10),
  ];

  return { score: weightedScore(kpis), kpis };
}
