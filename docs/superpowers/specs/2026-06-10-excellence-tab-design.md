# Excellence Tab — Design Spec

**Date:** 2026-06-10
**Status:** Implemented

## Goal

Add an "Excellence" tab to the ops dashboard that gives Daniel a command center for driving quality culture and tying team performance to incentives. The tab answers one question at a glance: *how close is each team to being world-class?*

---

## Tab Structure

**Sidebar label:** Excellence
**Position:** After Installation, before Marketing

### Layout (top to bottom)

1. **Customer Reviews Banner** — full-width strip at the top showing Google rating, review volume, response rate, and trend vs previous period. Requires new Google Business Profile API integration — the marketing section's GMB data is iframe-based and not accessible from the ops backend.

2. **Period Selector** — This Week / This Month / This Quarter / Last Month. Single selector controls the entire tab.

3. **5-Team Scorecards** — A row of cards, one per team (PM, Sales, Production, Installation, Admin). Each card shows:
   - Team name + icon
   - Composite score (0–100) in large type
   - Letter grade with color coding (A/B/C/D/F)
   - Trend arrow vs previous period
   - 3 KPI pills showing biggest movers (red = dragging score down, green = driving it up)

4. **Team Drill-Down Panel** — Clicking any scorecard expands a panel below showing:
   - Operational KPI breakdown (each metric, value, weight, contribution to score)
   - Culture score breakdown (peer review average, task response time, communication activity)
   - Customer review signals tied to that team
   - Sparkline trend for each KPI over last 6 periods
   - Red flags surfaced at the top (what's pulling the score down most)

5. **Company Trend Chart** — Multi-line chart at the bottom showing all 5 team scores over the last 8 weeks/months. Lets Daniel see if the whole company is improving or if one team is dragging.

---

## Scoring Architecture

Every team's score has three layers:

| Layer | Weight | Description |
|-------|--------|-------------|
| Operational | 70% | KPIs from Asana / HubSpot / OpenPhone |
| Culture | 20% | Peer review submissions + Asana engagement signals |
| Customer Reviews | 10% | Google/Facebook signals tied to that team's work |

### Grading Scale
- 90–100 → **A** (green)
- 75–89 → **B** (blue)
- 60–74 → **C** (yellow)
- 45–59 → **D** (orange)
- Below 45 → **F** (red)

---

## Operational KPIs Per Team

### PM Team *(Asana)*

| KPI | Weight | Signal |
|-----|--------|--------|
| Task on-time rate | 20% | % tasks completed by due date |
| PM audit/health score | 15% | Existing weighted performance score |
| Promise date changes | 20% | How often due dates get pushed (Asana task stories) |
| Stuck job rate | 15% | % jobs with zero activity in 7+ days |
| Job setup completeness | 15% | % jobs with due date, PM, and section set at creation |
| Client milestone adherence | 15% | % tasks tagged "Milestone" (Asana custom field) completed by due date |

### Sales Team *(HubSpot + OpenPhone)*

| KPI | Weight | Signal |
|-----|--------|--------|
| Speed to lead | 20% | Avg time from lead created → first contact |
| Inbound call answer rate | 15% | % inbound calls answered (OpenPhone) |
| Follow-up within 48h | 15% | % leads that received follow-up within 2 days |
| Stage stagnation | 20% | Avg days deals sit in each stage vs target (configurable thresholds, defaults: Lead 3d, Contacted 5d, Qualified 7d, Proposal 14d, Negotiation 7d) |
| Quote turnaround | 15% | Time from "needs quote" → proposal sent |
| Win rate | 15% | Closed won / total closed |

### Production Team *(Asana)*

| KPI | Weight | Signal |
|-----|--------|--------|
| On-time completion rate | 20% | % jobs finished by production due date |
| Rework/redo rate | 25% | % jobs with "Redo" tag applied (new — see requirements) |
| First-pass quality rate | 20% | % jobs completed without any stage regression |
| Dept-level on-time breakdown | 15% | Per-department on-time rate (vinyl, paint, fab, electrical) |
| Avg job cycle time | 10% | Days from production start → complete |
| Jobs past due 3+ days | 10% | Severity indicator for seriously late jobs |

### Installation Team *(Asana)*

| KPI | Weight | Signal |
|-----|--------|--------|
| On-time install rate | 20% | % installs completed on scheduled date |
| Crew scorecard average | 20% | Existing crew performance scores |
| Reschedule rate | 20% | 1x = -5pts, 2x+ = -15pts weighting |
| Bled-over rate | 15% | % jobs that ran past install date |
| At-risk job rate | 15% | % jobs flagged at risk going into the week |
| Intake completeness | 10% | % jobs arriving with crew, date, address, PM all set |

### Admin Team *(meta-score)*

Admin owns the system — their score reflects how well the machine runs.

| KPI | Weight | Signal |
|-----|--------|--------|
| Company on-time average | 25% | Avg on-time rate across PM + Production + Installation |
| Job intake speed | 20% | Time from deal closed → job set up in Asana |
| Job setup completeness | 20% | % new jobs fully configured (all fields + assignments) |
| Process adherence rate | 20% | % jobs that followed correct workflow without stage skipping |
| Blocker resolution time | 15% | Avg time to clear tasks tagged "Blocked" (Asana tag) across all teams — from tag applied → tag removed |

---

## Culture Scoring (20% of total)

Each team's culture score is computed from:

| KPI | Weight | Source |
|-----|--------|--------|
| Peer review average | 40% | Monthly submission from team leads (see below) |
| Task response time | 30% | Avg time from task assigned → first action (Asana) |
| Communication activity | 30% | Comment/update rate on active jobs (Asana) |

### Peer Review Mechanism

Once a month, a team lead (or Daniel) submits a culture score for each team across 4 dimensions:
- **Communication** — clear and fast?
- **Accountability** — are people owning their work?
- **Attitude** — positive and collaborative?
- **Process adherence** — following the playbook?

Each rated 1–10. The average becomes the team's peer review score for the month.

**UI:** A "Submit Reviews" button in the Excellence tab opens a simple form. Takes ~2 minutes. Submissions stored in Vercel KV. One submission per period per reviewer. Historical submissions kept for trend analysis.

---

## Customer Reviews (10% of total)

### Company-Wide Banner
Full-width strip at the top of the Excellence tab:
- Current Google star rating + trend vs previous period
- Review volume this period vs previous
- Response rate (% reviews responded to)
- Facebook rating if available

Data source: existing GMB integration in the marketing section.

### Per-Team Attribution

| Team | Review Signal |
|------|--------------|
| Sales | Rating trends tagged with quoting/sales experience |
| Production | Quality complaint signals |
| Installation | Install experience ratings |
| PM | Project communication ratings |
| Admin | Overall company rating trend — flows through the 10% customer review layer, not double-counted in operational score |

*Note: Per-team attribution uses simple keyword matching on review text (e.g. "install", "design", "quote", "project manager") to route signals. Not exact — used as a trend indicator, not a precision metric.*

---

## New Data Requirements

| Requirement | Used By | Priority |
|-------------|---------|----------|
| "Redo" tag in Asana production projects | Production rework rate, first-pass quality | High — add before launch |
| Peer review form + Vercel KV storage | Culture score | High — core feature |
| Google Business Profile API integration | Customer reviews banner + per-team review signals | Medium — new integration, requires GBP API credentials |
| Asana task story parsing for due date changes | PM promise date changes | Medium — stories endpoint already used elsewhere |

---

## New API Routes

| Route | Purpose |
|-------|--------|
| `api/excellence-scores.js` | Aggregates all team scores for the period — calls other APIs or shared lib |
| `api/excellence-peer-review.js` | GET/POST peer review submissions (Vercel KV) |
| `api/_lib/excellence/scoring.js` | Score computation logic — weights applied, grade assigned |
| `api/_lib/excellence/culture.js` | Culture score computation |

---

## Frontend Components

| Component | Purpose |
|-----------|--------|
| `src/sections/ExcellenceSection.jsx` | Top-level section — wires period selector, scorecards, trend chart |
| `src/components/excellence/ReviewsBanner.jsx` | Customer reviews strip at top |
| `src/components/excellence/TeamScorecard.jsx` | Individual team score card with grade + KPI pills |
| `src/components/excellence/TeamDrillDown.jsx` | Expanded panel — full KPI breakdown + sparklines |
| `src/components/excellence/CompanyTrend.jsx` | Multi-line trend chart (all 5 teams over time) |
| `src/components/excellence/PeerReviewForm.jsx` | Monthly culture submission form |
| `src/hooks/useExcellenceScores.js` | Fetches and caches all team scores |
| `src/hooks/usePeerReviews.js` | Fetches peer review history |

---

## Out of Scope

- No Excellence mirror repo (this tab is ops-only — individual teams don't see each other's scores)
- No employee-facing interface — Daniel and leadership only
- No automated Google review responses
- No integration with payroll or HR systems (incentive payouts tracked manually)
- No mobile-optimized layout (ops dashboard is desktop-first)
