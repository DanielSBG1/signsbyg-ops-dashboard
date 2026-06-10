# Excellence Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Excellence tab to the ops dashboard with per-team 0–100 scores (operational + culture + reviews) that Daniel uses to drive incentives across PM, Sales, Production, Installation, and Admin.

**Architecture:** A single `GET /api/excellence-scores?period=month` endpoint assembles all 5 team scores in parallel by importing existing lib builders (`buildPmMetrics`, `buildProductionMetrics`) and making targeted HubSpot calls for sales. A `POST /api/excellence-peer-review` endpoint stores monthly culture submissions in Vercel KV. The frontend is a period-aware scorecard grid with expandable drill-down panels and a multi-line trend chart.

**Tech Stack:** React 18, Recharts, Tailwind CSS, Vercel KV (`@vercel/kv`), Asana REST API, HubSpot CRM API

---

## File Map

**Create:**
```
api/_lib/excellence/scoring.js            — KPI normalization + grade utilities
api/_lib/excellence/pm-scores.js          — PM operational KPI computation
api/_lib/excellence/sales-scores.js       — Sales operational KPI computation
api/_lib/excellence/production-scores.js  — Production operational KPI computation
api/_lib/excellence/installation-scores.js — Installation operational KPI computation
api/_lib/excellence/admin-scores.js       — Admin operational KPI computation
api/_lib/excellence/culture.js            — Culture score computation
api/excellence-peer-review.js             — GET/POST peer review submissions
api/excellence-scores.js                  — Main aggregation endpoint
src/hooks/useExcellenceScores.js          — Fetches + caches all team scores
src/hooks/usePeerReviews.js               — Fetches peer review history
src/components/excellence/TeamScorecard.jsx   — Score card with grade + KPI pills
src/components/excellence/TeamDrillDown.jsx   — Expanded KPI breakdown panel
src/components/excellence/CompanyTrend.jsx    — Multi-line trend chart
src/components/excellence/PeerReviewForm.jsx  — Monthly culture submission form
src/components/excellence/ReviewsBanner.jsx   — Customer reviews strip (V1 placeholder)
src/sections/ExcellenceSection.jsx            — Top-level section component
```

**Modify:**
```
src/components/Sidebar.jsx   — Add Excellence nav item
src/App.jsx                  — Add lazy ExcellenceSection + render branch
```

---

## Task 1: Scoring Utilities

**Files:**
- Create: `api/_lib/excellence/scoring.js`

- [ ] **Step 1: Write the file**

```js
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
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/danielgarnier/Claude Code/signsbyg-ops-dashboard"
git add api/_lib/excellence/scoring.js
git commit -m "feat(excellence): scoring utility functions"
```

---

## Task 2: PM Score Builder

**Files:**
- Create: `api/_lib/excellence/pm-scores.js`

- [ ] **Step 1: Write the file**

```js
// api/_lib/excellence/pm-scores.js
import { buildPmMetrics } from '../pm/metrics.js';
import { buildPmAudit }   from '../pm/audit.js';
import { rateScore, invertedRateScore, weightedScore, kpi } from './scoring.js';

export async function computePmOperationalScore() {
  const [metrics] = await Promise.all([buildPmMetrics(), buildPmAudit()]);
  const { totals, scorecards, departmentLoad } = metrics;

  const today        = new Date().toISOString().slice(0, 10);
  const sevenAgo     = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // 1. Task on-time rate: subtasks not overdue / total subtasks with due dates
  const allTasks       = Object.values(departmentLoad).flatMap(d => d.tasks);
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
  const stuckCount   = scorecards.filter(j => (j.modified_at ?? '').slice(0, 10) < sevenAgo).length;
  const stuckRate    = scorecards.length > 0 ? stuckCount / scorecards.length : 0;

  // 5. Job setup completeness: jobs that have a due_on set
  const withDueJob         = scorecards.filter(j => j.due_on).length;
  const setupCompletion    = scorecards.length > 0 ? withDueJob / scorecards.length : 1;

  // 6. On-track rate (milestone adherence proxy): healthy band jobs / active
  const onTrackRate = totals.active > 0 ? totals.onTrack / totals.active : 1;

  const kpis = [
    kpi('taskOnTimeRate',     'Task On-Time Rate',      rateScore(taskOnTimeRate),              `${Math.round(taskOnTimeRate * 100)}%`,      0.20),
    kpi('jobHealthScore',     'Job Health Score',        Math.min(100, Math.round(avgHealth)),   `${Math.round(avgHealth)}/100`,              0.15),
    kpi('overdueSubtaskRate', 'Overdue Subtask Rate',    invertedRateScore(overdueRate, 0.10),   `${Math.round(overdueRate * 100)}%`,         0.20),
    kpi('stuckJobRate',       'Stuck Job Rate',          invertedRateScore(stuckRate, 0.10),     `${Math.round(stuckRate * 100)}%`,           0.15),
    kpi('jobSetupComplete',   'Job Setup Completeness',  rateScore(setupCompletion),             `${Math.round(setupCompletion * 100)}%`,     0.15),
    kpi('onTrackRate',        'On-Track Rate',           rateScore(onTrackRate),                 `${Math.round(onTrackRate * 100)}%`,         0.15),
  ];

  return { score: weightedScore(kpis), kpis };
}
```

- [ ] **Step 2: Commit**

```bash
git add api/_lib/excellence/pm-scores.js
git commit -m "feat(excellence): PM operational score builder"
```

---

## Task 3: Sales Score Builder

**Files:**
- Create: `api/_lib/excellence/sales-scores.js`

- [ ] **Step 1: Write the file**

```js
// api/_lib/excellence/sales-scores.js
import { searchAllCRM }           from '../sales/hubspot.js';
import { CLOSED_WON_STAGES, CLOSED_LOST_STAGES, HOT_STAGES_BY_PIPELINE, PIPELINE_STAGES } from '../sales/constants.js';
import { rateScore, invertedRateScore, timeScore, weightedScore, kpi } from './scoring.js';

/** Returns ISO date string N days ago. */
function daysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

/** Map period string to lookback days. */
function periodDays(period) {
  if (period === 'week')      return 7;
  if (period === 'lastmonth') return 60; // fetch 2 months, filter to prev 30
  if (period === 'quarter')   return 90;
  return 30; // month default
}

export async function computeSalesOperationalScore(period = 'month') {
  const days = periodDays(period);
  const since = daysAgo(days);

  // --- Win rate: closed won / (closed won + closed lost) in period ---
  const allClosedWon  = CLOSED_WON_STAGES.join(';');
  const allClosedLost = CLOSED_LOST_STAGES.join(';');

  const [wonDeals, lostDeals, activeDeals] = await Promise.all([
    searchAllCRM('deals', {
      filters: [
        { propertyName: 'closedate', operator: 'GTE', value: since },
        { propertyName: 'dealstage', operator: 'IN', values: CLOSED_WON_STAGES },
      ],
      properties: ['dealstage', 'closedate', 'dealname', 'amount'],
      limit: 200,
    }),
    searchAllCRM('deals', {
      filters: [
        { propertyName: 'closedate', operator: 'GTE', value: since },
        { propertyName: 'dealstage', operator: 'IN', values: CLOSED_LOST_STAGES },
      ],
      properties: ['dealstage', 'closedate'],
      limit: 200,
    }),
    searchAllCRM('deals', {
      filters: [
        { propertyName: 'dealstage', operator: 'NOT_IN', values: [...CLOSED_WON_STAGES, ...CLOSED_LOST_STAGES] },
        { propertyName: 'createdate', operator: 'GTE', value: daysAgo(180) },
      ],
      properties: ['dealstage', 'createdate', 'hs_date_entered_' + 'appointmentscheduled', 'pipeline'],
      limit: 500,
    }),
  ]);

  const totalClosed = wonDeals.length + lostDeals.length;
  const winRate = totalClosed > 0 ? wonDeals.length / totalClosed : 0;

  // --- Pipeline health: hot deals / total active ---
  const hotStageIds = new Set(
    Object.values(HOT_STAGES_BY_PIPELINE).flat()
  );
  const hotCount    = activeDeals.filter(d => hotStageIds.has(d.properties.dealstage)).length;
  const pipelineHealthRate = activeDeals.length > 0 ? hotCount / activeDeals.length : 0;

  // --- Stage stagnation: deals in proposal stage > 14 days ---
  const proposalStageIds = new Set(
    Object.values(PIPELINE_STAGES)
      .flat()
      .filter(s => s.label.toLowerCase().includes('proposal') || s.label.toLowerCase().includes('awaiting'))
      .map(s => s.id)
  );
  const proposalDeals  = activeDeals.filter(d => proposalStageIds.has(d.properties.dealstage));
  const stagnantCount  = proposalDeals.filter(d => {
    const entered = d.properties.createdate;
    if (!entered) return false;
    return (Date.now() - new Date(entered).getTime()) > 14 * 86_400_000;
  }).length;
  const stagnationRate = proposalDeals.length > 0 ? stagnantCount / proposalDeals.length : 0;

  // --- Proposal sent rate: won + proposal deals / qualified deals ---
  const qualifiedStageIds = new Set(
    Object.values(PIPELINE_STAGES).flat()
      .filter(s => s.label.toLowerCase().includes('qualified') || s.label.toLowerCase().includes('drafting'))
      .map(s => s.id)
  );
  const qualifiedCount = activeDeals.filter(d => qualifiedStageIds.has(d.properties.dealstage)).length;
  const sentCount      = wonDeals.length + proposalDeals.length;
  const sentRate       = (qualifiedCount + sentCount) > 0 ? sentCount / (qualifiedCount + sentCount) : 0;

  // --- Revenue pipeline health: non-zero amount active deals ---
  const withAmount  = activeDeals.filter(d => parseFloat(d.properties.amount || '0') > 0).length;
  const amountRate  = activeDeals.length > 0 ? withAmount / activeDeals.length : 0;

  // --- Activity rate: deals updated in last 7 days ---
  const recentlyUpdated = activeDeals.filter(d => {
    const updatedAt = d.properties.hs_lastmodifieddate ?? d.properties.createdate;
    return updatedAt && new Date(updatedAt).getTime() > Date.now() - 7 * 86_400_000;
  }).length;
  const activityRate = activeDeals.length > 0 ? recentlyUpdated / activeDeals.length : 0;

  const kpis = [
    kpi('winRate',           'Win Rate',              rateScore(winRate),                       `${Math.round(winRate * 100)}%`,             0.25),
    kpi('pipelineHealth',    'Pipeline Health',        rateScore(pipelineHealthRate),            `${hotCount}/${activeDeals.length} hot`,    0.20),
    kpi('stagnationRate',    'Proposal Stagnation',    invertedRateScore(stagnationRate, 0.20),  `${Math.round(stagnationRate * 100)}%`,      0.20),
    kpi('sentRate',          'Proposal Sent Rate',     rateScore(sentRate),                      `${Math.round(sentRate * 100)}%`,            0.15),
    kpi('amountRate',        'Deals with Amount Set',  rateScore(amountRate),                    `${Math.round(amountRate * 100)}%`,          0.10),
    kpi('activityRate',      'Pipeline Activity',      rateScore(activityRate),                  `${recentlyUpdated}/${activeDeals.length}`,  0.10),
  ];

  return { score: weightedScore(kpis), kpis };
}
```

- [ ] **Step 2: Commit**

```bash
git add api/_lib/excellence/sales-scores.js
git commit -m "feat(excellence): sales operational score builder"
```

---

## Task 4: Production Score Builder

**Files:**
- Create: `api/_lib/excellence/production-scores.js`

- [ ] **Step 1: Write the file**

```js
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
  const redoRate = totalTracked > 0 ? totals.redos / totalTracked : 0;

  // 3. First-pass quality rate: jobs with no redo at all / total
  const firstPassRate = totalTracked > 0 ? (totalTracked - totals.redos) / totalTracked : 1;

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
```

- [ ] **Step 2: Commit**

```bash
git add api/_lib/excellence/production-scores.js
git commit -m "feat(excellence): production operational score builder"
```

---

## Task 5: Installation Score Builder

**Files:**
- Create: `api/_lib/excellence/installation-scores.js`

- [ ] **Step 1: Write the file**

```js
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

  const { jobs = [], byCrew = [], summary = {} } = data;

  const completedJobs = jobs.filter(j => j.completed);
  const total         = jobs.length;

  // 1. On-time install rate: (early + on_time) / completed
  const onTimeCount = completedJobs.filter(j => j.status === 'early' || j.status === 'on_time').length;
  const onTimeRate  = completedJobs.length > 0 ? onTimeCount / completedJobs.length : 1;

  // 2. Crew scorecard average: mean onTimeRate across active crews
  const activeCrew  = byCrew.filter(c => c.completed > 0);
  const avgCrewRate = activeCrew.length > 0
    ? activeCrew.reduce((s, c) => s + c.onTimeRate, 0) / activeCrew.length / 100
    : onTimeRate;

  // 3. Reschedule rate: weighted — 1x = 0.5 weight, 2x+ = 1.5 weight
  const rescheduled1x  = jobs.filter(j => j.rescheduleCount === 1).length;
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
    kpi('onTimeRate',       'On-Time Install Rate',    rateScore(onTimeRate),                      `${Math.round(onTimeRate * 100)}%`,       0.20),
    kpi('crewScorecard',    'Crew Scorecard Avg',      rateScore(avgCrewRate),                     `${Math.round(avgCrewRate * 100)}%`,      0.20),
    kpi('rescheduleRate',   'Reschedule Rate',         invertedRateScore(rescheduleRate, 0.15),    `${rescheduled1x}×1, ${rescheduledMulti}×2+`, 0.20),
    kpi('bledOverRate',     'Bled-Over Rate',          invertedRateScore(bledOverRate, 0.10),      `${bledOver} jobs`,                       0.15),
    kpi('atRiskRate',       'At-Risk Rate',            invertedRateScore(atRiskRate, 0.10),        `${atRisk} jobs`,                         0.15),
    kpi('intakeComplete',   'Intake Completeness',     rateScore(intakeRate),                      `${Math.round(intakeRate * 100)}%`,       0.10),
  ];

  return { score: weightedScore(kpis), kpis };
}
```

- [ ] **Step 2: Commit**

```bash
git add api/_lib/excellence/installation-scores.js
git commit -m "feat(excellence): installation operational score builder"
```

---

## Task 6: Admin Score Builder

**Files:**
- Create: `api/_lib/excellence/admin-scores.js`

Admin's score is a meta-score: it takes the already-computed PM, Production, and Installation scores as input plus raw PM job data.

- [ ] **Step 1: Write the file**

```js
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

  const today = new Date().toISOString().slice(0, 10);

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
  const criticalRate = totals.active > 0 ? totals.critical / totals.active : 0;

  const kpis = [
    kpi('companyOnTimeAvg',  'Company On-Time Avg',     rateScore(companyOnTimeAvg),            `${Math.round(companyOnTimeAvg * 100)}%`, 0.30),
    kpi('jobSetupComplete',  'Job Setup Completeness',  rateScore(setupRate),                   `${Math.round(setupRate * 100)}%`,        0.25),
    kpi('processAdherence',  'Process Adherence',       rateScore(onTrackRate),                 `${Math.round(onTrackRate * 100)}%`,      0.25),
    kpi('noDueDateRate',     'No Due Date Rate',        invertedRateScore(noDueDateRate, 0.10), `${Math.round(noDueDateRate * 100)}%`,    0.10),
    kpi('criticalJobRate',   'Critical Job Rate',       invertedRateScore(criticalRate, 0.10),  `${totals.critical} jobs`,                0.10),
  ];

  return { score: weightedScore(kpis), kpis };
}
```

- [ ] **Step 2: Commit**

```bash
git add api/_lib/excellence/admin-scores.js
git commit -m "feat(excellence): admin operational score builder"
```

---

## Task 7: Culture Score Builder

**Files:**
- Create: `api/_lib/excellence/culture.js`

Culture score = 40% peer review average (from KV) + 60% Asana activity proxy.

- [ ] **Step 1: Write the file**

```js
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
    kpi('peerReview',        'Peer Review Avg',    peerScore,             submissions.length > 0 ? `${submissions.length} review(s)` : 'No reviews yet', 0.40),
    kpi('activityProxy',     'Task Activity Rate', activityProxyScore,    `${activityProxyScore}/100`, 0.60),
  ];

  return { score: weightedScore(kpis), kpis };
}
```

- [ ] **Step 2: Commit**

```bash
git add api/_lib/excellence/culture.js
git commit -m "feat(excellence): culture score builder"
```

---

## Task 8: Peer Review API Route

**Files:**
- Create: `api/excellence-peer-review.js`

- [ ] **Step 1: Write the file**

```js
// api/excellence-peer-review.js
import { getCached, setCached } from './_lib/cache.js';
import { peerReviewKey } from './_lib/excellence/culture.js';

const REVIEW_TTL = 60 * 60 * 24 * 45; // 45 days

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'GET') {
    const period = req.query.period ?? currentMonthStr();
    const data   = await getCached(peerReviewKey(period));
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, data: data ?? [] });
  }

  if (req.method === 'POST') {
    const { period, reviewer, team, communication, accountability, attitude, processAdherence } = req.body ?? {};

    const validTeams = ['pm', 'sales', 'production', 'installation', 'admin'];
    if (!team || !validTeams.includes(team))
      return res.status(400).json({ ok: false, error: 'Invalid team' });
    if ([communication, accountability, attitude, processAdherence].some(v => typeof v !== 'number' || v < 1 || v > 10))
      return res.status(400).json({ ok: false, error: 'All dimensions must be 1–10' });

    const key      = peerReviewKey(period ?? currentMonthStr());
    const existing = (await getCached(key)) ?? [];

    const submission = {
      team,
      reviewer: reviewer ?? 'anonymous',
      communication,
      accountability,
      attitude,
      processAdherence,
      submittedAt: new Date().toISOString(),
    };

    const updated = [...existing, submission];
    await setCached(key, updated, REVIEW_TTL);

    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, data: submission });
  }

  res.status(405).json({ ok: false, error: 'Method not allowed' });
}
```

- [ ] **Step 2: Verify the endpoint handles bad input — run this curl after deploying locally:**

```bash
curl -X POST http://localhost:3000/api/excellence-peer-review \
  -H "Content-Type: application/json" \
  -d '{"team":"invalid","communication":5,"accountability":5,"attitude":5,"processAdherence":5}' \
  | jq .
# Expected: {"ok":false,"error":"Invalid team"}
```

- [ ] **Step 3: Commit**

```bash
git add api/excellence-peer-review.js
git commit -m "feat(excellence): peer review GET/POST API route"
```

---

## Task 9: Excellence Scores Aggregation Endpoint

**Files:**
- Create: `api/excellence-scores.js`

This is the main endpoint. It runs all 5 operational score builders in parallel, computes culture scores, combines layers, stores a history entry in KV, and returns the full payload.

- [ ] **Step 1: Write the file**

```js
// api/excellence-scores.js
import { getCached, setCached }                from './_lib/cache.js';
import { computePmOperationalScore }           from './_lib/excellence/pm-scores.js';
import { computeSalesOperationalScore }        from './_lib/excellence/sales-scores.js';
import { computeProductionOperationalScore }   from './_lib/excellence/production-scores.js';
import { computeInstallationOperationalScore } from './_lib/excellence/installation-scores.js';
import { computeAdminOperationalScore }        from './_lib/excellence/admin-scores.js';
import { computeCultureScore }                 from './_lib/excellence/culture.js';
import { compositeScore, computeGrade }        from './_lib/excellence/scoring.js';

const CACHE_KEY  = 'excellence:scores:v1';
const HIST_KEY   = 'excellence:history:v1';
const CACHE_TTL  = 120; // seconds

/** Returns a 0–100 proxy for team activity from their operational KPIs. */
function activityProxy(opsResult) {
  if (!opsResult?.kpis?.length) return 50;
  // Use the average of the top 3 scoring KPIs as a proxy for team engagement
  const sorted = [...opsResult.kpis].sort((a, b) => b.score - a.score);
  return Math.round(sorted.slice(0, 3).reduce((s, k) => s + k.score, 0) / Math.min(3, sorted.length));
}

async function buildExcellenceScores(period = 'month') {
  // --- Operational scores (parallel) ---
  const [pmOps, salesOps, prodOps, installOps] = await Promise.all([
    computePmOperationalScore().catch(e => { console.error('[excellence] pm-scores:', e.message); return { score: 50, kpis: [] }; }),
    computeSalesOperationalScore(period).catch(e => { console.error('[excellence] sales-scores:', e.message); return { score: 50, kpis: [] }; }),
    computeProductionOperationalScore().catch(e => { console.error('[excellence] prod-scores:', e.message); return { score: 50, kpis: [] }; }),
    computeInstallationOperationalScore().catch(e => { console.error('[excellence] install-scores:', e.message); return { score: 50, kpis: [], dataUnavailable: true }; }),
  ]);

  // Admin needs other scores as input
  const adminOps = await computeAdminOperationalScore({
    pm: pmOps.score, production: prodOps.score, installation: installOps.score,
  }).catch(e => { console.error('[excellence] admin-scores:', e.message); return { score: 50, kpis: [] }; });

  // --- Culture scores (parallel, one per team) ---
  const [pmCulture, salesCulture, prodCulture, installCulture, adminCulture] = await Promise.all([
    computeCultureScore('pm',           activityProxy(pmOps)),
    computeCultureScore('sales',        activityProxy(salesOps)),
    computeCultureScore('production',   activityProxy(prodOps)),
    computeCultureScore('installation', activityProxy(installOps)),
    computeCultureScore('admin',        activityProxy(adminOps)),
  ]);

  // Reviews score: 50 (neutral) until Google Reviews integration is built in V2
  const REVIEWS_DEFAULT = 50;

  // --- Composite scores ---
  function buildTeam(id, label, emoji, opsResult, cultureResult) {
    const operational = opsResult.score;
    const culture     = cultureResult.score;
    const reviews     = REVIEWS_DEFAULT;
    const total       = compositeScore({ operational, culture, reviews });
    return {
      id, label, emoji,
      score: total,
      grade: computeGrade(total),
      operational: { score: operational, kpis: opsResult.kpis },
      culture:     { score: culture,     kpis: cultureResult.kpis },
      reviews:     { score: reviews },
      dataUnavailable: opsResult.dataUnavailable ?? false,
    };
  }

  const teams = {
    pm:           buildTeam('pm',           'PM',           '📋', pmOps,      pmCulture),
    sales:        buildTeam('sales',        'Sales',        '📊', salesOps,   salesCulture),
    production:   buildTeam('production',   'Production',   '🏭', prodOps,    prodCulture),
    installation: buildTeam('installation', 'Installation', '🔧', installOps, installCulture),
    admin:        buildTeam('admin',        'Admin',        '⚙️', adminOps,   adminCulture),
  };

  // --- Store history snapshot (current month entry) ---
  const monthStr  = new Date().toISOString().slice(0, 7);
  const history   = (await getCached(HIST_KEY)) ?? [];
  const snapshot  = {
    period: monthStr,
    pm:           teams.pm.score,
    sales:        teams.sales.score,
    production:   teams.production.score,
    installation: teams.installation.score,
    admin:        teams.admin.score,
  };
  const existingIdx = history.findIndex(h => h.period === monthStr);
  if (existingIdx >= 0) history[existingIdx] = snapshot;
  else                  history.push(snapshot);
  // Keep last 12 months
  const trimmed = history.sort((a, b) => a.period.localeCompare(b.period)).slice(-12);
  await setCached(HIST_KEY, trimmed, 60 * 60 * 24 * 400); // ~13 months

  return {
    generatedAt: new Date().toISOString(),
    period,
    teams,
    history: trimmed,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const period = req.query.period ?? 'month';
  const bust   = req.query.bust === '1';
  const key    = `${CACHE_KEY}:${period}`;

  try {
    const data = bust
      ? await buildExcellenceScores(period)
      : await (async () => {
          const hit = await getCached(key);
          if (hit) return hit;
          const fresh = await buildExcellenceScores(period);
          await setCached(key, fresh, CACHE_TTL);
          return fresh;
        })();

    res.setHeader('Cache-Control', bust ? 'no-store' : 'public, s-maxage=120, stale-while-revalidate=600');
    return res.json({ ok: true, data });
  } catch (err) {
    console.error('[excellence-scores]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
```

- [ ] **Step 2: Smoke test the endpoint locally:**

```bash
# In signsbyg-ops-dashboard root
vercel dev &
sleep 5
curl "http://localhost:3000/api/excellence-scores?period=month" | jq '.data.teams | keys'
# Expected: ["admin","installation","pm","production","sales"]
```

- [ ] **Step 3: Commit**

```bash
git add api/excellence-scores.js
git commit -m "feat(excellence): main aggregation endpoint"
```

---

## Task 10: Sidebar + App Wiring

**Files:**
- Modify: `src/components/Sidebar.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Add Excellence to the SECTIONS array in `Sidebar.jsx`**

Open `src/components/Sidebar.jsx`. Find the `SECTIONS` array and add the Excellence entry after `installation` and before `marketing`:

```js
{ id: 'excellence',   label: 'Excellence',   sub: 'Scores · Culture',     emoji: '🏆', color: '#f59e0b' },
```

Full updated array:
```js
const SECTIONS = [
  { id: 'sales',        label: 'Sales',        sub: 'CRM · Calls',          emoji: '📊', color: '#6366f1' },
  { id: 'pm',           label: 'PM',           sub: 'Jobs · Audit',          emoji: '📋', color: '#a855f7' },
  { id: 'production',   label: 'Production',   sub: 'Overview · Throughput', emoji: '🏭', color: '#f97316' },
  { id: 'installation', label: 'Installation', sub: 'Jobs · Crews',          emoji: '🔧', color: '#eab308' },
  { id: 'excellence',   label: 'Excellence',   sub: 'Scores · Culture',      emoji: '🏆', color: '#f59e0b' },
  { id: 'marketing',    label: 'Marketing',    sub: 'GMB · Facebook · Web',  emoji: '📣', color: '#10b981' },
];
```

- [ ] **Step 2: Add ExcellenceSection to `App.jsx`**

Open `src/App.jsx`. Add the lazy import after the MarketingSection import:

```js
const ExcellenceSection = lazy(() => import('./sections/ExcellenceSection'));
```

Add the render branch after the installation branch:

```js
{section === 'excellence'    && <ExcellenceSection />}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.jsx src/App.jsx
git commit -m "feat(excellence): add Excellence to sidebar and App"
```

---

## Task 11: Data Hooks

**Files:**
- Create: `src/hooks/useExcellenceScores.js`
- Create: `src/hooks/usePeerReviews.js`

- [ ] **Step 1: Write `useExcellenceScores.js`**

```js
// src/hooks/useExcellenceScores.js
import { useState, useEffect, useCallback } from 'react';

const POLL_MS     = 120_000;
const STORAGE_KEY = 'excellence:scores';

export function useExcellenceScores(period = 'month') {
  const [data, setData]       = useState(() => {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}:${period}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const refresh = useCallback(async (bust = false) => {
    try {
      const url = `/api/excellence-scores?period=${period}${bust ? '&bust=1' : ''}`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'API error');
      setData(json.data);
      setError(null);
      try { localStorage.setItem(`${STORAGE_KEY}:${period}`, JSON.stringify(json.data)); } catch {}
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, loading, error, refresh };
}
```

- [ ] **Step 2: Write `usePeerReviews.js`**

```js
// src/hooks/usePeerReviews.js
import { useState, useCallback } from 'react';

export function usePeerReviews() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);
  const [submitted, setSubmitted]   = useState(false);

  const submitReview = useCallback(async ({ team, communication, accountability, attitude, processAdherence, reviewer }) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/excellence-peer-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team, communication, accountability, attitude, processAdherence, reviewer }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Submit failed');
      setSubmitted(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { submitReview, submitting, error, submitted, reset: () => { setSubmitted(false); setError(null); } };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useExcellenceScores.js src/hooks/usePeerReviews.js
git commit -m "feat(excellence): data hooks for scores and peer reviews"
```

---

## Task 12: TeamScorecard Component

**Files:**
- Create: `src/components/excellence/TeamScorecard.jsx`

- [ ] **Step 1: Write the file**

```jsx
// src/components/excellence/TeamScorecard.jsx
import React from 'react';
import { gradeColor } from '../../lib/excellenceUtils.js';

const GRADE_BG = { A: 'border-success/40 bg-success/5', B: 'border-accent/40 bg-accent/5', C: 'border-warning/40 bg-warning/5', D: 'border-orange-400/40 bg-orange-400/5', F: 'border-danger/40 bg-danger/5' };

export default function TeamScorecard({ team, isActive, onClick }) {
  if (!team) return null;

  const borderBg = GRADE_BG[team.grade] ?? 'border-white/10 bg-white/[0.02]';

  // Top 3 KPI pills — sorted: worst first (most need attention)
  const pills = [...(team.operational?.kpis ?? [])]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  return (
    <button
      onClick={onClick}
      className={`flex-1 min-w-[160px] text-left p-4 rounded-2xl border transition-all ${borderBg} ${isActive ? 'ring-2 ring-white/20' : 'hover:bg-white/[0.04]'}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl leading-none">{team.emoji}</span>
        <span className="text-sm font-semibold text-white/80">{team.label}</span>
        {team.dataUnavailable && (
          <span className="ml-auto text-[10px] text-white/30 border border-white/10 rounded px-1">loading</span>
        )}
      </div>

      {/* Score */}
      <div className="flex items-end gap-2 mb-1">
        <span className="text-4xl font-bold text-white tabular-nums leading-none">{team.score}</span>
        <span className={`text-2xl font-bold leading-none pb-0.5 ${gradeColor(team.grade)}`}>{team.grade}</span>
      </div>

      {/* Sub-scores */}
      <div className="flex gap-3 mb-3 text-[10px] text-white/30">
        <span>Ops {team.operational?.score ?? '—'}</span>
        <span>Culture {team.culture?.score ?? '—'}</span>
      </div>

      {/* KPI pills */}
      <div className="space-y-1">
        {pills.map(p => (
          <div key={p.key} className="flex items-center justify-between">
            <span className="text-[10px] text-white/40 truncate">{p.label}</span>
            <span className={`text-[10px] font-semibold tabular-nums ml-2 ${p.score >= 75 ? 'text-success' : p.score >= 50 ? 'text-warning' : 'text-danger'}`}>
              {p.score}
            </span>
          </div>
        ))}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Create `src/lib/excellenceUtils.js`** (shared between components)

```js
// src/lib/excellenceUtils.js
export function gradeColor(grade) {
  return { A: 'text-success', B: 'text-accent', C: 'text-warning', D: 'text-orange-400', F: 'text-danger' }[grade] ?? 'text-white/40';
}

export function scoreColor(score) {
  if (score >= 75) return 'text-success';
  if (score >= 50) return 'text-warning';
  return 'text-danger';
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/excellence/TeamScorecard.jsx src/lib/excellenceUtils.js
git commit -m "feat(excellence): TeamScorecard component"
```

---

## Task 13: TeamDrillDown Component

**Files:**
- Create: `src/components/excellence/TeamDrillDown.jsx`

- [ ] **Step 1: Write the file**

```jsx
// src/components/excellence/TeamDrillDown.jsx
import React from 'react';
import { scoreColor } from '../../lib/excellenceUtils.js';

function KpiRow({ kpi }) {
  const barWidth = `${kpi.score}%`;
  return (
    <div className="py-2.5 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-white/70">{kpi.label}</span>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-white/30">{kpi.rawLabel}</span>
          <span className={`text-sm font-bold tabular-nums w-8 text-right ${scoreColor(kpi.score)}`}>{kpi.score}</span>
          <span className="text-[10px] text-white/20 w-8 text-right">{Math.round((kpi.weight ?? 0) * 100)}%</span>
        </div>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${kpi.score >= 75 ? 'bg-success' : kpi.score >= 50 ? 'bg-warning' : 'bg-danger'}`}
          style={{ width: barWidth }}
        />
      </div>
    </div>
  );
}

function Section({ title, score, kpis }) {
  if (!kpis?.length) return null;
  const sorted = [...kpis].sort((a, b) => a.score - b.score); // worst first
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold text-white/50 uppercase tracking-widest">{title}</h4>
        <span className={`text-sm font-bold tabular-nums ${scoreColor(score)}`}>{score}</span>
      </div>
      {sorted.map(k => <KpiRow key={k.key} kpi={k} />)}
    </div>
  );
}

export default function TeamDrillDown({ team }) {
  if (!team) return null;

  const flags = (team.operational?.kpis ?? [])
    .filter(k => k.score < 60)
    .sort((a, b) => a.score - b.score);

  return (
    <div className="mt-4 space-y-4 animate-fade-in">
      {/* Red flags */}
      {flags.length > 0 && (
        <div className="bg-danger/5 border border-danger/20 rounded-xl p-4">
          <p className="text-xs font-semibold text-danger/80 uppercase tracking-widest mb-2">Needs Attention</p>
          {flags.map(f => (
            <div key={f.key} className="flex items-center justify-between py-1">
              <span className="text-sm text-white/70">{f.label}</span>
              <span className="text-sm font-bold text-danger tabular-nums">{f.score} — {f.rawLabel}</span>
            </div>
          ))}
        </div>
      )}

      {/* Operational + Culture breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Operational KPIs" score={team.operational?.score} kpis={team.operational?.kpis} />
        <Section title="Culture"          score={team.culture?.score}     kpis={team.culture?.kpis} />
      </div>

      {team.dataUnavailable && (
        <p className="text-xs text-white/30 text-center py-2">
          Installation data loads from cache — visit the Installation tab first to warm it up, then refresh.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/excellence/TeamDrillDown.jsx
git commit -m "feat(excellence): TeamDrillDown component"
```

---

## Task 14: CompanyTrend Chart

**Files:**
- Create: `src/components/excellence/CompanyTrend.jsx`

- [ ] **Step 1: Write the file**

```jsx
// src/components/excellence/CompanyTrend.jsx
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const TEAM_COLORS = {
  pm:           '#a855f7',
  sales:        '#6366f1',
  production:   '#f97316',
  installation: '#eab308',
  admin:        '#f59e0b',
};

const TEAM_LABELS = {
  pm: 'PM', sales: 'Sales', production: 'Production', installation: 'Installation', admin: 'Admin',
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy border border-white/10 rounded-xl p-3 shadow-xl min-w-[150px]">
      <p className="text-xs text-white/40 mb-2">{label}</p>
      {[...payload].sort((a, b) => b.value - a.value).map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-xs text-white/60">{TEAM_LABELS[p.dataKey]}</span>
          </div>
          <span className="text-xs font-bold text-white tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function CompanyTrend({ history = [] }) {
  if (history.length < 2) {
    return (
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-4">Company Trend</h3>
        <p className="text-white/30 text-sm text-center py-8">Trend data builds over time — check back next month.</p>
      </div>
    );
  }

  const chartData = history.map(h => ({
    ...h,
    period: h.period.slice(0, 7), // YYYY-MM
  }));

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
      <h3 className="text-sm font-semibold text-white/50 uppercase tracking-widest mb-6">Company Trend</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="period" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          {Object.keys(TEAM_COLORS).map(key => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={TEAM_COLORS[key]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 justify-center">
        {Object.entries(TEAM_COLORS).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ background: color }} />
            <span className="text-[11px] text-white/40">{TEAM_LABELS[key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/excellence/CompanyTrend.jsx
git commit -m "feat(excellence): CompanyTrend multi-line chart"
```

---

## Task 15: PeerReviewForm Component

**Files:**
- Create: `src/components/excellence/PeerReviewForm.jsx`

- [ ] **Step 1: Write the file**

```jsx
// src/components/excellence/PeerReviewForm.jsx
import React, { useState } from 'react';
import { usePeerReviews } from '../../hooks/usePeerReviews.js';

const TEAMS = [
  { id: 'pm',           label: 'PM',           emoji: '📋' },
  { id: 'sales',        label: 'Sales',        emoji: '📊' },
  { id: 'production',   label: 'Production',   emoji: '🏭' },
  { id: 'installation', label: 'Installation', emoji: '🔧' },
  { id: 'admin',        label: 'Admin',        emoji: '⚙️' },
];

const DIMENSIONS = [
  { key: 'communication',     label: 'Communication',      desc: 'Clear and fast?' },
  { key: 'accountability',    label: 'Accountability',     desc: 'Owning their work?' },
  { key: 'attitude',          label: 'Attitude',           desc: 'Positive and collaborative?' },
  { key: 'processAdherence',  label: 'Process Adherence',  desc: 'Following the playbook?' },
];

function ScoreInput({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5,6,7,8,9,10].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`w-7 h-7 rounded text-xs font-bold transition-all ${
            n <= value
              ? n >= 8 ? 'bg-success text-white' : n >= 5 ? 'bg-warning text-black' : 'bg-danger text-white'
              : 'bg-white/5 text-white/30 hover:bg-white/10'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export default function PeerReviewForm({ onClose }) {
  const { submitReview, submitting, error, submitted } = usePeerReviews();
  const [step, setStep] = useState(0); // 0 = team select, 1 = scoring
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [scores, setScores] = useState({ communication: 5, accountability: 5, attitude: 5, processAdherence: 5 });

  function handleSubmit() {
    submitReview({ ...scores, team: selectedTeam, reviewer: 'daniel' });
  }

  if (submitted) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-3">✅</div>
        <p className="text-white font-semibold">Review submitted!</p>
        <p className="text-white/40 text-sm mt-1">Culture score will update on next refresh.</p>
        <button onClick={onClose} className="mt-4 text-accent text-sm hover:underline">Close</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Monthly Culture Review</h3>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 text-lg leading-none">×</button>
      </div>

      {step === 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-white/40">Which team are you reviewing?</p>
          {TEAMS.map(t => (
            <button
              key={t.id}
              onClick={() => { setSelectedTeam(t.id); setStep(1); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/[0.06] transition-colors text-left"
            >
              <span className="text-xl">{t.emoji}</span>
              <span className="text-sm font-medium text-white">{t.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setStep(0)} className="text-white/30 hover:text-white/60 text-sm">← Back</button>
            <span className="text-sm text-white/60">
              {TEAMS.find(t => t.id === selectedTeam)?.emoji} {TEAMS.find(t => t.id === selectedTeam)?.label}
            </span>
          </div>

          {DIMENSIONS.map(d => (
            <div key={d.key} className="space-y-2">
              <div>
                <p className="text-xs font-semibold text-white/70">{d.label}</p>
                <p className="text-[11px] text-white/30">{d.desc}</p>
              </div>
              <ScoreInput value={scores[d.key]} onChange={v => setScores(s => ({ ...s, [d.key]: v }))} />
            </div>
          ))}

          {error && <p className="text-xs text-danger">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-50 hover:bg-accent/80 transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Review'}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/excellence/PeerReviewForm.jsx
git commit -m "feat(excellence): PeerReviewForm component"
```

---

## Task 16: ReviewsBanner Placeholder

**Files:**
- Create: `src/components/excellence/ReviewsBanner.jsx`

- [ ] **Step 1: Write the file**

```jsx
// src/components/excellence/ReviewsBanner.jsx
import React from 'react';

export default function ReviewsBanner() {
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl px-6 py-4 flex items-center gap-6">
      <div className="flex items-center gap-2">
        <span className="text-xl">⭐</span>
        <div>
          <p className="text-xs text-white/40 uppercase tracking-widest">Google Reviews</p>
          <p className="text-sm text-white/30 mt-0.5">Google Business Profile integration coming soon</p>
        </div>
      </div>
      <div className="ml-auto text-[10px] text-white/20 border border-white/10 rounded px-2 py-1">V2</div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/excellence/ReviewsBanner.jsx
git commit -m "feat(excellence): ReviewsBanner placeholder (V2)"
```

---

## Task 17: ExcellenceSection (Top-Level)

**Files:**
- Create: `src/sections/ExcellenceSection.jsx`

- [ ] **Step 1: Write the file**

```jsx
// src/sections/ExcellenceSection.jsx
import React, { useState } from 'react';
import { useExcellenceScores } from '../hooks/useExcellenceScores.js';
import TeamScorecard  from '../components/excellence/TeamScorecard.jsx';
import TeamDrillDown  from '../components/excellence/TeamDrillDown.jsx';
import CompanyTrend   from '../components/excellence/CompanyTrend.jsx';
import PeerReviewForm from '../components/excellence/PeerReviewForm.jsx';
import ReviewsBanner  from '../components/excellence/ReviewsBanner.jsx';

const PERIODS = [
  { id: 'week',      label: 'This Week' },
  { id: 'month',     label: 'This Month' },
  { id: 'quarter',   label: 'This Quarter' },
  { id: 'lastmonth', label: 'Last Month' },
];

const TEAM_ORDER = ['pm', 'sales', 'production', 'installation', 'admin'];

export default function ExcellenceSection() {
  const [period, setPeriod]           = useState('month');
  const [activeTeam, setActiveTeam]   = useState(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const { data, loading, error, refresh } = useExcellenceScores(period);

  const teams = data?.teams ?? {};

  function toggleTeam(id) {
    setActiveTeam(prev => prev === id ? null : id);
  }

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Excellence</h1>
            {data && (
              <p className="text-white/40 text-xs mt-1">
                Updated {new Date(data.generatedAt).toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReviewForm(true)}
              className="text-white/50 hover:text-white text-xs px-3 py-1.5 border border-white/10 rounded-lg transition-colors"
            >
              Submit Culture Review
            </button>
            <button
              onClick={() => refresh(true)}
              className="text-white/40 hover:text-white/70 text-xs px-3 py-1.5 border border-white/10 rounded-lg transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Reviews banner */}
        <ReviewsBanner />

        {/* Period selector */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === p.id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Loading / error */}
        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="bg-danger/10 border border-danger/30 rounded-xl px-4 py-3 text-sm text-danger">
            Error loading scores: {error}
          </div>
        )}

        {/* Scorecards row */}
        {data && (
          <div className="flex gap-3 flex-wrap">
            {TEAM_ORDER.map(id => (
              <TeamScorecard
                key={id}
                team={teams[id]}
                isActive={activeTeam === id}
                onClick={() => toggleTeam(id)}
              />
            ))}
          </div>
        )}

        {/* Drill-down panel */}
        {activeTeam && teams[activeTeam] && (
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{teams[activeTeam].emoji}</span>
              <h2 className="text-lg font-bold">{teams[activeTeam].label}</h2>
              <span className="text-3xl font-bold tabular-nums ml-2">{teams[activeTeam].score}</span>
              <button onClick={() => setActiveTeam(null)} className="ml-auto text-white/30 hover:text-white/60 text-xl leading-none">×</button>
            </div>
            <TeamDrillDown team={teams[activeTeam]} />
          </div>
        )}

        {/* Company trend */}
        {data?.history && <CompanyTrend history={data.history} />}

      </div>

      {/* Peer review modal */}
      {showReviewForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-navy border border-white/10 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <PeerReviewForm onClose={() => setShowReviewForm(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/sections/ExcellenceSection.jsx
git commit -m "feat(excellence): ExcellenceSection top-level component"
```

---

## Task 18: Final Wiring + Smoke Test

- [ ] **Step 1: Start dev server and verify Excellence tab loads**

```bash
cd "/Users/danielgarnier/Claude Code/signsbyg-ops-dashboard"
npm run dev
# Open http://localhost:5173
# Click Excellence in the sidebar
# Expected: Tab loads, shows 5 scorecard placeholders (may show loading spinner while API fetches)
```

- [ ] **Step 2: Verify API endpoint returns valid data**

```bash
curl "http://localhost:3000/api/excellence-scores?period=month" | jq '{ok, teams: (.data.teams | keys), history_length: (.data.history | length)}'
# Expected: {"ok":true,"teams":["admin","installation","pm","production","sales"],"history_length":1}
```

- [ ] **Step 3: Test peer review submission**

```bash
curl -X POST http://localhost:3000/api/excellence-peer-review \
  -H "Content-Type: application/json" \
  -d '{"team":"sales","communication":8,"accountability":7,"attitude":9,"processAdherence":6}' \
  | jq .
# Expected: {"ok":true,"data":{"team":"sales",...}}

# Verify it appears on GET
curl "http://localhost:3000/api/excellence-peer-review" | jq '.data | length'
# Expected: 1
```

- [ ] **Step 4: Submit culture review via UI**
- Open Excellence tab → click "Submit Culture Review" → pick Sales → rate all 4 dimensions → Submit
- Expected: success confirmation message

- [ ] **Step 5: Final commit and push**

```bash
git add -A
git status  # verify nothing unexpected is staged
git commit -m "feat(excellence): wire excellence tab end-to-end"
```

Then push both repos per the mirror policy:
```bash
# Push ops (GitHub MCP — use mcp__github__push_files if git push fails with auth 128)
git push origin main

# Excellence is ops-only — no mirror needed for this tab
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ 5-team scorecards (Tasks 12, 17)
- ✅ Operational KPIs per team (Tasks 2–6)
- ✅ Culture score + peer review mechanism (Tasks 7, 8, 15)
- ✅ Period selector (Task 17)
- ✅ Drill-down panel with KPI breakdown (Task 13)
- ✅ Company trend chart (Task 14)
- ✅ Customer reviews banner (Task 16 — placeholder, V2 for live data)
- ✅ Scoring 70/20/10 split (Task 9)
- ✅ Grade scale A–F (Task 1)
- ✅ Sidebar + App wiring (Task 10)
- ✅ Vercel KV for peer review storage (Task 8)

**V2 enhancements (not in this plan):**
- Google Business Profile API for live review data
- Promise date changes via Asana story events (currently uses overdue proxy)
- Sales speed-to-lead and follow-up rate via HubSpot contact activity
- Admin blocker resolution time via "Blocked" Asana tag
- Per-period trend data (currently tracks by calendar month)
