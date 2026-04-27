export const PRODUCTION_PROJECT_GID = '1204877952044255';

// GID of the "Production Due Date" custom field — authoritative expected completion date
export const PRODUCTION_DUE_DATE_CF_GID = '1210757373140456';

// opt_fields for production sub-task queries
export const PROD_SUBTASK_FIELDS = [
  'gid', 'name', 'due_on', 'completed', 'modified_at',
  'parent.gid', 'parent.name', 'assignee.name',
  'custom_fields.gid', 'custom_fields.date_value',
].join(',');

// opt_fields for sub-sub-task queries
export const SUBSUBTASK_FIELDS = [
  'gid', 'name', 'due_on', 'completed', 'assignee.name',
].join(',');

// opt_fields for throughput queries (completed tasks)
export const THROUGHPUT_FIELDS = [
  'gid', 'name', 'due_on', 'completed', 'completed_at',
].join(',');

/**
 * Department bucket rules — evaluated in priority order, first match wins.
 * `indicator` is matched case-insensitively against sub-sub-task names.
 */
export const DEPT_RULES = [
  { key: 'channel_letters', label: 'Channel Letters', indicator: 'channel letter fab' },
  { key: 'fabrication',     label: 'Fabrication',     indicator: 'fabrication' },
  { key: 'vinyl_fco',       label: 'Vinyl & FCO',      indicator: 'vinyl' },
  { key: 'outsourced',      label: 'Outsourced',       indicator: null },
];

// Prefix that identifies a redo sub-sub-task (case-insensitive)
export const REDO_PREFIX = 're do -';
