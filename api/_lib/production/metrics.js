import { DEPT_SECTION_MAP, REDO_PREFIX, PRODUCTION_PROJECT_GID, PROD_SUBTASK_FIELDS, SUBSUBTASK_FIELDS, PRODUCTION_DUE_DATE_CF_GID, PROMISED_DATE_CF_GID } from './constants.js';
import { getProjectTasks, getTasksCompletedSince, getSubtasks } from './asana.js';
import { pLimit } from '../concurrency.js';

export function getWeekRange(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diffToMon);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return {
    start: mon.toISOString().slice(0, 10),
    end:   sun.toISOString().slice(0, 10),
  };
}

export function buildScheduleStats(openTasks, completedTasks, range, today) {
  const completedInRange = completedTasks.filter(t =>
    t.due_on && t.due_on >= range.start && t.due_on <= range.end
  );
  const openInRange = openTasks.filter(t =>
    t.due_on && t.due_on >= range.start && t.due_on <= range.end
  );
  const onTime = completedInRange.filter(t =>
    t.completed_at && t.completed_at.slice(0, 10) <= t.due_on
  ).length;
  const completedLate = completedInRange.filter(t =>
    t.completed_at && t.completed_at.slice(0, 10) > t.due_on
  ).length;
  const overdueOpen = openInRange.filter(t => t.due_on < today).length;
  const jobs = [
    ...openInRange.map(t => ({
      gid:    t.gid,
      name:   t.parent?.name ?? t.name,
      due_on: t.due_on,
      state:  t.due_on < today ? 'overdue' : 'in_progress',
    })),
    ...completedInRange.map(t => ({
      gid:    t.gid,
      name:   t.parent?.name ?? t.name,
      due_on: t.due_on,
      state:  (t.completed_at?.slice(0, 10) ?? '9999') <= t.due_on ? 'on_time' : 'late',
    })),
  ].sort((a, b) => (a.due_on < b.due_on ? -1 : 1));
  return {
    scheduled:  completedInRange.length + openInRange.length,
    onTime,
    late:        completedLate + overdueOpen,
    inProgress:  openInRange.filter(t => t.due_on >= today).length,
    jobs,
  };
}

export function extractProductionDueDate(task) {
  const cf = task.custom_fields?.find(f => f.gid === PRODUCTION_DUE_DATE_CF_GID);
  return cf?.date_value?.date ?? task.due_on ?? null;
}

export function extractPromisedDate(task) {
  const cf = task.custom_fields?.find(f => f.gid === PROMISED_DATE_CF_GID);
  return cf?.date_value?.date ?? null;
}

export function deriveStatus(due_on, today) {
  if (!due_on) return 'no_date';
  if (due_on < today) return 'late';
  return 'on_track';
}

export function isProjectedLate(subSubTasks, today) {
  return subSubTasks.some(s => !s.completed && s.due_on && s.due_on < today);
}

export function detectRedoType(subSubTasks, parentSubtaskCount) {
  const hasRedoSub = subSubTasks.some(s =>
    (s.name?.toLowerCase() ?? '').startsWith(REDO_PREFIX)
  );
  if (hasRedoSub) return 'production';
  if (parentSubtaskCount > 1) return 'pm_sales';
  return null;
}

export function inferDepartment(task) {
  const sectionName = task.memberships?.[0]?.section?.name?.toLowerCase() ?? '';
  for (const { key, fragment } of DEPT_SECTION_MAP) {
    if (sectionName.includes(fragment)) return key;
  }
  return 'outsourced';
}

export async function buildProductionMetrics() {
  const limit = pLimit(5);
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  const year = today.slice(0, 4);
  const month = today.slice(5, 7);

  const thisWeekRange = getWeekRange(today);
  const lastWeekD = new Date(today + 'T12:00:00Z');
  lastWeekD.setUTCDate(lastWeekD.getUTCDate() - 7);
  const lastWeekRange = getWeekRange(lastWeekD.toISOString().slice(0, 10));
  const twoWeeksAgoD = new Date(today + 'T12:00:00Z');
  twoWeeksAgoD.setUTCDate(twoWeeksAgoD.getUTCDate() - 14);
  const twoWeeksAgoRange = getWeekRange(twoWeeksAgoD.toISOString().slice(0, 10));
  const nextWeekD = new Date(today + 'T12:00:00Z');
  nextWeekD.setUTCDate(nextWeekD.getUTCDate() + 7);
  const nextWeekRange = getWeekRange(nextWeekD.toISOString().slice(0, 10));

  const monthStart = `${year}-${month}-01`;
  const monthEnd = new Date(Number(year), Number(month), 0).toISOString().slice(0, 10);
  const lastMonthNum = Number(month) === 1 ? 12 : Number(month) - 1;
  const lastMonthYear = Number(month) === 1 ? Number(year) - 1 : Number(year);
  const lastMonthStart = `${lastMonthYear}-${String(lastMonthNum).padStart(2, '0')}-01`;
  const lastMonthEnd = new Date(Number(lastMonthYear), lastMonthNum, 0).toISOString().slice(0, 10);
  const currentQuarter = Math.ceil(Number(month) / 3);
  const quarterStarts = ['01-01', '04-01', '07-01', '10-01'];
  const quarterEnds   = ['03-31', '06-30', '09-30', '12-31'];
  const thisQuarterRange = {
    start: `${year}-${quarterStarts[currentQuarter - 1]}`,
    end:   `${year}-${quarterEnds[currentQuarter - 1]}`,
  };

  const scheduleSince = `${year}-01-01`;
  const SCHEDULE_FIELDS = 'gid,name,due_on,completed,completed_at,parent.gid,parent.name,custom_fields.gid,custom_fields.date_value';

  const [incompleteTasks, scheduleTasks] = await Promise.all([
    getProjectTasks(PRODUCTION_PROJECT_GID, PROD_SUBTASK_FIELDS),
    getTasksCompletedSince(PRODUCTION_PROJECT_GID, scheduleSince, SCHEDULE_FIELDS),
  ]);

  const normalizeDueDate = t => ({ ...t, due_on: extractProductionDueDate(t) });
  const normalizedIncompleteTasks = incompleteTasks.map(normalizeDueDate);
  const completedTasksOnly = scheduleTasks.filter(t => t.completed === true).map(normalizeDueDate);
  const completedThisWeek = completedTasksOnly.filter(t =>
    t.completed_at && t.completed_at.slice(0, 10) >= sevenDaysAgo
  ).length;

  const parentSubtaskCount = {};
  for (const t of incompleteTasks) {
    const pgid = t.parent?.gid;
    if (pgid) parentSubtaskCount[pgid] = (parentSubtaskCount[pgid] ?? 0) + 1;
  }

  const subSubTaskMap = {};
  await Promise.all(
    incompleteTasks.map(t =>
      limit(() =>
        getSubtasks(t.gid, SUBSUBTASK_FIELDS).then(subs => {
          subSubTaskMap[t.gid] = subs.map(s => ({
            gid: s.gid,
            name: s.name,
            due_on: s.due_on ?? null,
            completed: s.completed,
            completed_at: s.completed_at ? s.completed_at.slice(0, 10) : null,
            assignee: s.assignee?.name ?? null,
          }));
        })
      )
    )
  );

  const jobs = incompleteTasks
    .filter(t => t.parent?.gid)
    .map(t => {
      const subTasks = subSubTaskMap[t.gid] ?? [];
      const count = parentSubtaskCount[t.parent.gid] ?? 1;
      const due_on = extractProductionDueDate(t);
      const status = deriveStatus(due_on, today);
      return {
        gid:  t.gid,
        name: t.parent.name,
        due_on,
        startDate:    t.start_on ?? null,
        createdAt:    t.created_at ? t.created_at.slice(0, 10) : null,
        promisedDate: extractPromisedDate(t),
        status,
        projectedLate: status !== 'late' && isProjectedLate(subTasks, today),
        redoType: detectRedoType(subTasks, count),
        department: inferDepartment(t),
        subTasks,
      };
    });

  jobs.sort((a, b) => {
    if (a.status === 'late' && b.status !== 'late') return -1;
    if (b.status === 'late' && a.status !== 'late') return 1;
    if (!a.due_on && !b.due_on) return 0;
    if (!a.due_on) return 1;
    if (!b.due_on) return -1;
    return a.due_on < b.due_on ? -1 : 1;
  });

  const departmentLoad = {
    channel_letters: [],
    fabrication: [],
    vinyl_fco: [],
    outsourced: [],
  };
  for (const job of jobs) departmentLoad[job.department].push(job);

  const bss = (range) => buildScheduleStats(normalizedIncompleteTasks, completedTasksOnly, range, today);
  const schedule = {
    thisWeek:    bss(thisWeekRange),
    nextWeek:    bss(nextWeekRange),
    lastWeek:    bss(lastWeekRange),
    twoWeeksAgo: bss(twoWeeksAgoRange),
    thisMonth:   bss({ start: monthStart,     end: monthEnd }),
    lastMonth:   bss({ start: lastMonthStart, end: lastMonthEnd }),
    thisQuarter: bss(thisQuarterRange),
    q1:          bss({ start: `${year}-01-01`, end: `${year}-03-31` }),
    q2:          bss({ start: `${year}-04-01`, end: `${year}-06-30` }),
    q3:          bss({ start: `${year}-07-01`, end: `${year}-09-30` }),
    q4:          bss({ start: `${year}-10-01`, end: `${year}-12-31` }),
  };

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      active: jobs.length,
      onTrack: jobs.filter(j => j.status === 'on_track').length,
      late: jobs.filter(j => j.status === 'late').length,
      projectedLate: jobs.filter(j => j.projectedLate).length,
      redos: jobs.filter(j => j.redoType !== null).length,
      completedThisWeek,
    },
    jobs,
    departmentLoad,
    schedule,
  };
}
