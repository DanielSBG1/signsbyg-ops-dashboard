// Department Asana project GIDs and lead names.
// Multi-homed subtasks appear in these projects; we group them by parent main task GID.
export const DEPARTMENTS = {
  design: {
    label: 'Design',
    lead: 'Yusseli',
    projectGid: '1205365037867864',
  },
  permitting: {
    label: 'Permitting',
    lead: 'Gaby',
    projectGid: '1204877952044226',
  },
  production: {
    label: 'Production',
    lead: 'Manuel Flores',
    projectGid: '1204877952044255',
  },
  installation: {
    label: 'Installation',
    lead: 'RJ',
    projectGid: '1204877952044284',
  },
  invoicing: {
    label: 'Invoicing',
    lead: 'Carola',
    projectGid: '1204877952044313',
  },
};

// Reverse lookup: Asana project GID -> department key
export const GID_TO_DEPT = Object.fromEntries(
  Object.entries(DEPARTMENTS).map(([key, { projectGid }]) => [projectGid, key])
);

// Health score penalty weights (all negative)
export const HEALTH_WEIGHTS = {
  mainTaskOverdue: -8,
  redoSubtask: -6,
  subtaskOverdue: -4,
  stale: -3,
  highDesignComments: -2,
  highPermittingComments: -2,
  missingDueDate: -1, // multiplied by number of subtasks missing due date
};

// Comment count above these thresholds triggers a penalty
export const COMMENT_THRESHOLDS = {
  design: 6,
  permitting: 15,
};

// Days without main task modification before a job is considered stale
export const STALE_DAYS = 5;

// Score band boundaries
export const SCORE_BANDS = {
  healthy: 90,   // score >= 90
  watch: 70,     // score >= 70
  risk: 50,      // score >= 50
  // critical: score < 50
};
