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

## Out of Scope

- No Excellence mirror repo (this tab is ops-only — individual teams don't see each other's scores)
- No employee-facing interface — Daniel and leadership only
- No automated Google review responses
- No integration with payroll or HR systems (incentive payouts tracked manually)
- No mobile-optimized layout (ops dashboard is desktop-first)
