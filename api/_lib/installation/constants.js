// Asana Installation Department project
export const INSTALL_PROJECT_GID = '1204877952044284';

// Custom field GIDs on Installation tasks
export const FIELDS = {
  // Set DEPOSIT_PAID to your Asana enum field GID once you create it.
  // Expected enum values: 'Yes' / 'No'  (or 'Paid' / 'Unpaid')
  DEPOSIT_PAID:      null,
  INSTALL_DATE:      '1209324069252516',
  SURVEY_DATE:       '1211736230172866',
  SERVICE_DATE:      '1213228593899115',
  PROMISED_DATE:     '1212638956774268',
  ESTIMATED_TIME:    '1207351344936433',
  TEAM:              '1207353516712071',
  METRO:             '1213452673378079',
  SCOPE:             '1210009423881971',
  PM:                '1210008923851231',
  STREET_ADDRESS:    '1204877952044388',
  CONTACT_NAME:      '1212638950547930',
  CONTACT_PHONE:     '1205932519962703',
  CONTACT_EMAIL:     '1213876407810862',
  SURVEY_REQUIRED:   '1213876436984513',
};

// Sections in the Installation project (workflow stages)
export const SECTIONS = [
  { gid: '1207983418659742', name: 'Unreviewed' },
  { gid: '1213391494403081', name: 'Pending Date' },
  { gid: '1213195067441910', name: 'Admin Task/Hole, Digger, Concrete' },
  { gid: '1212608261957581', name: 'Service' },
  { gid: '1212608261957582', name: 'Survey' },
  { gid: '1213516547461688', name: "Sales/Pm's Surveys" },
  { gid: '1212691541960958', name: 'Self Performed Installation' },
  { gid: '1210827060409487', name: 'Outsourced' },
  { gid: '1212767647674361', name: 'On Hold' },
  { gid: '1213516547461691', name: 'Completed, Pending Information to Close out' },
];

// Active crews (from Team/Crew custom field — enabled options only, plus Unassigned for legacy tasks)
export const CREWS = [
  // Crew pairs
  { gid: '1212710121596390', name: 'Roberth & Jorge', color: '#ef4444' },
  { gid: '1212710121596391', name: 'Yandy & Cesar',   color: '#06b6d4' },
  { gid: '1212710121596392', name: 'Poli & Midiel',   color: '#22c55e' },
  { gid: '1212710121596393', name: 'Manuel',          color: '#64748b' },
  // Individual crew members (added 2025)
  { gid: '1214471773268033', name: 'Roberth',         color: '#f87171' },
  { gid: '1214471773268035', name: 'Jorge',           color: '#60a5fa' },
  { gid: '1214471773268032', name: 'Yandy',           color: '#fbbf24' },
  { gid: '1214471773268034', name: 'Cesar',           color: '#22d3ee' },
  { gid: '1214471773268031', name: 'Poli',            color: '#fb923c' },
  { gid: '1214471773268030', name: 'Midiel',          color: '#f97316' },
  // Legacy — disabled in Asana but has open tasks
  { gid: '1212738527863233', name: 'Unassigned',      color: '#6b7280' },
];

export const METROS = [
  { gid: '1213452673378080', name: 'Houston' },
  { gid: '1213452673378081', name: 'D/FW' },
  { gid: '1213452673378082', name: 'San Antonio' },
  { gid: '1213452673378083', name: 'Austin' },
  { gid: '1213452673378084', name: 'East Texas' },
  { gid: '1213452673378085', name: 'South Texas' },
  { gid: '1213452673378086', name: 'Panhandle' },
  { gid: '1213452673378087', name: 'West Texas' },
  { gid: '1213452544683386', name: 'Out of State' },
];

// Completion status classification
// 'early'       — completed before Install Date, 0 reschedules
// 'on_time'     — completed on Install Date, 0 reschedules
// 'rescheduled' — completed, 1 reschedule
// 'failed'      — completed, 2+ reschedules
// 'late'        — past Install Date, not completed
// 'scheduled'   — Install Date in future
// 'pending'     — no Install Date set
export const STATUS_COLORS = {
  early:       '#22c55e',
  on_time:     '#06d6a0',
  rescheduled: '#eab308',
  failed:      '#ef4444',
  late:        '#f97316',
  scheduled:   '#06b6d4',
  pending:     '#6b7280',
};
