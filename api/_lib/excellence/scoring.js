// api/_lib/excellence/scoring.js

/**
 * Normalize a 0–1 rate where HIGHER is better → 0–100 score.
 */
export function rateScore(rate) {
  return Math.round(Math.min(100, Math.max(0, (rate ?? 0) * 100)));
}

/**
 * Normalize a 0–1 rate where LOWER is better → 0–100 score.
 * threshold: rate that scores ~50 (e.g. 0.10 = 10% rework → 50pts).
 */
export function invertedRateScore(rate, threshold = 0.10) {
  const r = rate ?? 0;
  if (r <= 0) return 100;
  if (r >= threshold * 2) return 0;
  return Math.round(100 * (1 - r / (threshold * 2)));
}

/**
 * Normalize a numeric value where LOWER is better → 0–100 score.
 * target: value that earns 100 (ideal). bad: value that earns 0.
 */
export function timeScore(value, target, bad) {
  const v = value ?? bad;
  if (v <= target) return 100;
  if (v >= bad) return 0;
  return Math.round(100 * (1 - (v - target) / (bad - target)));
}

/**
 * Weighted average of KPI scores.
 * kpis: Array<{ score: number, weight: number }>
 */
export function weightedScore(kpis) {
  const totalWeight = kpis.reduce((s, k) => s + k.weight, 0);
  if (totalWeight === 0) return 0;
  return Math.round(kpis.reduce((s, k) => s + k.score * k.weight, 0) / totalWeight);
}

/**
 * Compute letter grade from 0–100 score.
 */
export function computeGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

/**
 * Tailwind text color class for a grade.
 */
export function gradeColor(grade) {
  return { A: 'text-success', B: 'text-accent', C: 'text-warning', D: 'text-orange-400', F: 'text-danger' }[grade] ?? 'text-white/40';
}

/**
 * Composite team score: 70% operational, 20% culture, 10% reviews.
 */
export function compositeScore({ operational, culture, reviews }) {
  return Math.round((operational ?? 0) * 0.70 + (culture ?? 50) * 0.20 + (reviews ?? 50) * 0.10);
}

/**
 * Build a KPI object for the drill-down panel.
 */
export function kpi(key, label, score, rawLabel, weight) {
  return { key, label, score, rawLabel, weight };
}
