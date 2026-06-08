// Map each Asana section name to the custom field that tracks its due date.
// Sections without a relevant date (admin, unreviewed, on hold, completed) use null.
// When the user wants a section's job to be "on track", they need the matching
// date set and in the future (or today).

import { todayISO } from './period.js';

export const SECTION_DATE_FIELD = {
  'Unreviewed':                                   null,
  'Pending Date':                                 null,
  'Admin Task/Hole, Digger, Concrete':            'installDate',
  'Service':                                      'serviceDate',
  'Survey':                                       'surveyDate',
  "Sales/Pm's Surveys":                           'surveyDate',
  'Self Performed Installation':                  'installDate',
  'Outsourced':                                   'installDate',
  'On Hold':                                      null,
  'Completed, Pending Information to Close out':  null,
};

// For each job, return a category relative to "today":
//   'completed'   — task is completed in Asana
//   'late'        — has a relevant date, date < today, not completed
//   'today'       — has a relevant date == today, not completed
//   'on_track'    — has a relevant date > today, not completed
//   'missing'     — the section requires a date but none is set
//   'na'          — section doesn't need a date (Unreviewed, On Hold, etc.)
export function getSectionJobState(job) {
  if (job.completed) return 'completed';
  const fieldName = SECTION_DATE_FIELD[job.section];
  if (!fieldName) return 'na';
  const dateValue = job[fieldName];
  if (!dateValue) return 'missing';
  const today = todayISO();
  if (dateValue < today) return 'late';
  if (dateValue === today) return 'today';
  return 'on_track';
}

export const STATE_COLORS = {
  completed: '#16a34a',   // dark green
  late:      '#ef4444',   // red
  today:     '#3b82f6',   // blue
  on_track:  '#22c55e',   // green
  missing:   '#94a3b8',   // gray
  na:        '#475569',   // dim gray
};

export const STATE_LABELS = {
  completed: 'Completed',
  late:      'Late',
  today:     'Due Today',
  on_track:  'On Track',
  missing:   'Missing Date',
  na:        'N/A',
};
