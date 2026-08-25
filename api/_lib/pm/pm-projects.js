// api/_lib/pm-projects.js
// Active PMs — these are the only people who should be managing projects.
// Any project NOT assigned to one of these PMs is flagged as unmanaged.
export const ACTIVE_PM_NAMES = ['Nikhil', 'Danish', 'Barbara'];

export const PM_PROJECTS = [
  { name: 'Nikhil',    projectGid: '1214976061389925' },
  { name: 'Danish',    projectGid: '1216893918721229' },
  { name: 'Barbara',   projectGid: '1217221173097702' },
  // Legacy PM projects — kept for visibility into unmanaged jobs
  { name: 'Abhijeet',  projectGid: '1213805951050269' },
  { name: 'Siddhen',   projectGid: '1213805951050266' },
  { name: 'Amanda',    projectGid: '1213805951050263' },
  { name: 'Antonella', projectGid: '1213805951050272' },
  { name: 'Daniel',    projectGid: '1213805951006762' },
];
