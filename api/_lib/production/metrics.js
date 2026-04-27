import { DEPT_RULES, REDO_PREFIX, PRODUCTION_PROJECT_GID, PROD_SUBTASK_FIELDS, SUBSUBTASK_FIELDS, PRODUCTION_DUE_DATE_CF_GID } from './constants.js';
import { getProjectTasks, getTasksCompletedSince, getSubtasks } from './asana.js';
import { pLimit } from '../concurrency.js';

/**
 * Returns { start, end } (YYYY-MM-DD, inclusive Mon–Sun) for the ISO week
 * containing dateStr.
 */
export function getWeekRange(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun
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

/**
 * Builds schedule stats for a date range from raw Asana task arrays.
 * @param {Array} openTasks       incomplete production sub-tasks
 * @param {Array} completedTasks  completed production sub-tasks (t.completed === true)
 * @param {{ start: string, end: string }} range  YYYY-MM-DD inclusive
 * @param {string} today          YYYY-MM-DD
 */
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

/**
 * Returns the "Production Due Date" custom field value (YYYY-MM-DD) for a task,
 * falling back to the task's standard due_on if the custom field is unset.
 */
export function extractProductionDueDate(task) {
  const cf = task.custom_fields?.find(f => f.gid === PRODUCTION_DUE_DATE_CF_GID);
  return cf?.date_value?.date ?? task.due_on ?? null;
}

/**
 * Derives job status from the production sub-task's due date.
 * @param {string|null} due_on  YYYY-MM-DD or null
 * @param {string} today        YYYY-MM-DD
 * @returns {'late'|'on_track'|'no_date'}
 */
export function deriveStatus(due_on, today) {
  if (!due_on) return 'no_date';
  if (due_on < today) return 'late';
  return 'on_track';
}

/**
 * Returns true if any incomplete sub-sub-task has a due date before today.
 * @param {Array<{completed: boolean, due_on: string|null}>} subSubTasks
 * @param {string} today  YYYY-MM-DD
 */
export function isProjectedLate(subSubTasks, today) {
  return subSubTasks.some(s => !s.completed && s.due_on && s.due_on < today);
}

/**
 * Detects redo type from sub-sub-task names and parent production sub-task count.
 * @param {Array<{name: string}>} subSubTasks
 * @param {number} parentSubtaskCount  how many production sub-tasks share this main task
 * @returns {'production'|'pm_sales'|null}
 */
export function detectRedoType(subSubTasks, parentSubtaskCount) {
  const hasRedoSub = subSubTasks.some(s =>
    (s.name?.toLowerCase() ?? '').startsWith(REDO_PREFIX)
  );
  if (hasRedoSub) return 'production';
  if (parentSubtaskCount > 1) return 'pm_sales';
  return null;
}

/**
 * Infers department from which sub-sub-tasks are present.
 * Uses DEPT_RULES priority order — first match wins.
 * @param {Array<{name: string}>} subSubTasks
 * @returns {'channel_letters'|'fabrication'|'vinyl_fco'|'outsourced'}
 */
export function inferDepartment(subSubTasks) {
  const names = subSubTasks.map(s => s.name?.toLowerCase() ?? '');
  for (const rule of DEPT_RULES) {
    if (rule.indicator && names.some(n => n.includes(rule.indicator))) {
      return rule.key;
    }
  }
  return 'outsourced';
}

/**
 * Fetches all active production jobs and derives status, redo type, and department.
 * Called by the production-metrics API handler (wrapped in cache).
 */
export async function buildProductionMetrics() {
  const limit = pLimit(5);
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  // Date ranges for schedule stats
  const thisWeekRange = getWeekRange(today);
  const lastWeekD = new Date(today + 'T12:00:00Z');
  lastWeekD.setUTCDate(lastWeekD.getUTCDate() - 7);
  const lastWeekRange = getWeekRange(lastWeekD.toISOString().slice(0, 10));
  const monthStart = `${today.slice(0, 7)}-01`;
  // Fetch from earliest date needed (start of month or start of last week)
  const scheduleSince = monthStart <= lastWeekRange.start ? monthStart : lastWeekRange.start;

  const SCHEDULE_FIELDS = 'gid,name,due_on,completed,completed_at,parent.gid,parent.name,custom_fields.gid,custom_fields.date_value';

  // 1. Parallel: incomplete production sub-tasks + schedule data back to month start
  const [incompleteTasks, scheduleTasks] = await Promise.all([
    getProjectTasks(PRODUCTION_PROJECT_GID, PROD_SUBTASK_FIELDS),
    getTasksCompletedSince(PRODUCTION_PROJECT_GID, scheduleSince, SCHEDULE_FIELDS),
  ]);

  // Normalize due_on on all schedule tasks to use the Production Due Date custom field
  const normalizeDueDate = t => ({ ...t, due_on: extractProductionDueDate(t) });
  const normalizedIncompleteTasks = incompleteTasks.map(normalizeDueDate);
  const completedTasksOnly = scheduleTasks.filter(t => t.completed === true).map(normalizeDueDate);
  const completedThisWeek = completedTasksOnly.filter(t =>
    t.completed_at && t.completed_at.slice(0, 10) >= sevenDaysAgo
  ).length;

  // 2. Count how many production sub-tasks each parent main task has
  //    (>1 means PM/Sales redo)
  const parentSubtaskCount = {};
  for (const t of incompleteTasks) {
    const pgid = t.parent?.gid;
    if (pgid) parentSubtaskCount[pgid] = (parentSubtaskCount[pgid] ?? 0) + 1;
  }

  // 3. Fetch sub-sub-tasks for every production sub-task (max 5 concurrent)
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
            assignee: s.assignee?.name ?? null,
          }));
        })
      )
    )
  );

  // 4. Build job records
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
        status,
        projectedLate: status !== 'late' && isProjectedLate(subTasks, today),
        redoType: detectRedoType(subTasks, count),
        department: inferDepartment(subTasks),
        subTasks,
      };
    });

  // 5. Sort: late first → soonest due → no date last
  jobs.sort((a, b) => {
    if (a.status === 'late' && b.status !== 'late') return -1;
    if (b.status === 'late' && a.status !== 'late') return 1;
    if (!a.due_on && !b.due_on) return 0;
    if (!a.due_on) return 1;
    if (!b.due_on) return -1;
    return a.due_on < b.due_on ? -1 : 1;
  });

  // 6. Build department load buckets
  const departmentLoad = {
    channel_letters: [],
    fabrication: [],
    vinyl_fco: [],
    outsourced: [],
  };
  for (const job of jobs) departmentLoad[job.department].push(job);

  const schedule = {
    thisWeek:    buildScheduleStats(normalizedIncompleteTasks, completedTasksOnly, thisWeekRange, today),
    lastWeek:    buildScheduleStats(normalizedIncompleteTasks, completedTasksOnly, lastWeekRange, today),
    monthToDate: buildScheduleStats(normalizedIncompleteTasks, completedTasksOnly, { start: monthStart, end: today }, today),
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
