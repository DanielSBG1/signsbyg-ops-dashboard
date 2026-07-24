export const PRODUCTION_PROJECT_GID = '1204877952044255';

// Section GIDs for production workflow status
export const STAGING_SECTION_GID = '1216705802624362';    // Staging Area — treat as complete
export const UNREVIEWED_SECTION_GID = '1207351345119276'; // Unreviewed — needs triage

// GID of the "Production Due Date" custom field — authoritative expected completion date
export const PRODUCTION_DUE_DATE_CF_GID = '1210757373140456';

// GID of the "Promised Date" custom field — customer-facing commitment date
export const PROMISED_DATE_CF_GID = '1212638956774268';

// opt_fields for production sub-task queries
export const PROD_SUBTASK_FIELDS = [
  'gid', 'name', 'due_on', 'start_on', 'completed', 'created_at',
  'parent.gid', 'parent.name', 'assignee.name',
  'custom_fields.gid', 'custom_fields.date_value',
  'memberships.section.name', 'memberships.section.gid',
].join(',');

// opt_fields for sub-sub-task queries
export const SUBSUBTASK_FIELDS = [
  'gid', 'name', 'due_on', 'completed', 'completed_at', 'assignee.name',
].join(',');

// opt_fields for throughput queries (completed tasks)
export const THROUGHPUT_FIELDS = [
  'gid', 'name', 'due_on', 'completed', 'completed_at',
].join(',');

/**
 * Maps Asana section name fragments (case-insensitive) to department keys.
 * Evaluated in order — first match wins. Falls back to 'outsourced'.
 */
export const DEPT_SECTION_MAP = [
  { key: 'channel_letters', fragment: 'channel' },
  { key: 'fabrication',     fragment: 'fab' },
  { key: 'vinyl_fco',       fragment: 'vinyl' },
];

// Prefix that identifies a redo sub-sub-task (case-insensitive)
export const REDO_PREFIX = 're do -';
