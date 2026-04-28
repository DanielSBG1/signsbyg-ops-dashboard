# Asana Job Links — Design Spec

**Date:** 2026-04-27
**Status:** Approved

## Goal

Add an "Open in Asana ↗" affordance to every place in the Production section where a job is listed, so users can jump directly to the Asana task without leaving the dashboard.

## URL Construction

Asana task URLs are derived from the `gid` already present on every job object — no API changes required.

```
https://app.asana.com/0/0/{job.gid}
```

## Changes

### 1. `HealthJobsModal` rows (`OverviewTab.jsx`)

- Add a `↗` icon button as the last column in each job row.
- Clicking it opens the Asana URL in a new tab (`window.open`).
- Uses `e.stopPropagation()` so the row's existing click-to-drawer behavior is unaffected.
- Adjust the grid to accommodate the extra column (add ~40px column).

### 2. `StageJobsModal` rows (`OverviewTab.jsx`)

- Same treatment as above: `↗` button as last column, stop propagation, new tab.
- Adjust grid accordingly.

### 3. `DepartmentLoadTab` `JobRow` (`DepartmentLoadTab.jsx`)

- Add a `↗` icon button to the right of the due date in each expanded job row.
- Same behavior: opens Asana in new tab, stops propagation so the drawer still opens on row click.

### 4. `JobDrawer` header (`JobDrawer.jsx`)

- Add an "Open in Asana ↗" link button in the header area, between the job title and the × close button.
- Renders as a small muted anchor tag (`target="_blank" rel="noopener noreferrer"`).

## Visual Style

All Asana link buttons share the same style:
- Default: `text-white/30 hover:text-white/70 text-xs transition-colors`
- Label: `↗` (unicode arrow, no external icon dependency)
- No background or border — unobtrusive, brightens on hover

## Out of Scope

- No changes to API handlers or data shape.
- No changes to other dashboard sections (PM, Installation, Sales).
- No Asana links on sub-task rows inside the JobDrawer.
