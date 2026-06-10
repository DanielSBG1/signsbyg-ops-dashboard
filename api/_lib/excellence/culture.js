// api/_lib/excellence/culture.js
import { getCached } from '../cache.js';
import { rateScore, weightedScore, kpi } from './scoring.js';

/** Returns the KV key for peer reviews for a given YYYY-MM period string. */
export function peerReviewKey(periodStr) {
  return `excellence:peer-review:${periodStr}`;
}

/** Returns YYYY-MM string for the most recent completed month. */
function lastMonthStr() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

/** Returns YYYY-MM for the current month. */
function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Compute the culture score for a single team.
 * @param {string} team   — 'pm' | 'sales' | 'production' | 'installation' | 'admin'
 * @param {number} activityProxyScore — 0–100 derived from Asana/HubSpot activity (passed in)
 */
export async function computeCultureScore(team, activityProxyScore) {
  // Try current month first, fall back to last month if no submissions yet
  const currentKey  = peerReviewKey(currentMonthStr());
  const lastKey     = peerReviewKey(lastMonthStr());

  const [currentReviews, lastReviews] = await Promise.all([
    getCached(currentKey),
    getCached(lastKey),
  ]);

  const submissions = (currentReviews ?? lastReviews ?? [])
    .filter(s => s.team === team);

  let peerScore = 50; // neutral default when no submissions
  if (submissions.length > 0) {
    // Each submission has: communication, accountability, attitude, processAdherence (1–10)
    const avgDimension = (dim) =>
      submissions.reduce((s, r) => s + (r[dim] ?? 5), 0) / submissions.length;
    const avgRaw = (
      avgDimension('communication') +
      avgDimension('accountability') +
      avgDimension('attitude') +
      avgDimension('processAdherence')
    ) / 4;
    peerScore = Math.round((avgRaw / 10) * 100);
  }

  const kpis = [
    kpi('peerReview',    'Peer Review Avg',    peerScore,             submissions.length > 0 ? `${submissions.length} review(s)` : 'No reviews yet', 0.40),
    kpi('activityProxy', 'Task Activity Rate', activityProxyScore,    `${activityProxyScore}/100`, 0.60),
  ];

  return { score: weightedScore(kpis), kpis };
}
