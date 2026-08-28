import { DEPT_SECTION_MAP, REDO_PREFIX, PRODUCTION_PROJECT_GID, PROD_SUBTASK_FIELDS, SUBSUBTASK_FIELDS, PRODUCTION_DUE_DATE_CF_GID, PROMISED_DATE_CF_GID, STAGING_SECTION_GID, UNREVIEWED_SECTION_GID } from './constants.js';
import { getProjectTasks, getTasksCompletedSince, getSubtasks } from './asana.js';
import { pLimit } from '../concurrency.js';
import { getRescheduleCounts } from './rescheduleCache.js';

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
    completedLate,
    inProgress:  openInRange.filter(t => t.due_on >= today).length,
    jobs,
  };
}

/**
 * Returns the current production schedule date for a task.
 * Uses the native Asana due_on — this is the CURRENT schedule.
 * The custom field holds the ORIGINAL promised date for drift tracking.
 */
export function extractProductionDueDate(task) {
  return task.due_on ?? null;
}

/**
 * Days a job drifted from its original promise. Positive = late from promise.
 */
export function getRescheduleDrift(dueOn, promisedDate) {
  if (!dueOn || !promisedDate) return null;
  return Math.round((new Date(dueOn + 'T12:00:00') - new Date(promisedDate + 'T12:00:00')) / 86400000);
}

/**
 * Severity: 'none' | 'mild' (1-7d) | 'moderate' (8-14d) | 'severe' (15d+)
 */
export function driftSeverity(driftDays) {
  if (driftDays == null || driftDays <= 0) return 'none';
  if (driftDays <= 7) return 'mild';
  if (driftDays <= 14) return 'moderate';
  return 'severe';
}

/**
 * Returns the "Promised Date" custom field value (YYYY-MM-DD) for a task, or null.
 */
export function extractPromisedDate(task) {
  const cf = task.custom_fields?.find(f => f.gid === PROMISED_DATE_CF_GID);
  return cf?.date_value?.date ?? null;
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
 * Infers department from the Asana section the task belongs to.
 * Falls back to 'outsourced' if no section matches.
 * @param {object} task  raw Asana task with memberships
 * @returns {'channel_letters'|'fabrication'|'vinyl_fco'|'outsourced'}
 */
export function inferDepartment(task) {
  const sectionName = task.memberships?.[0]?.section?.name?.toLowerCase() ?? '';
  for (const { key, fragment } of DEPT_SECTION_MAP) {
    if (sectionName.includes(fragment)) return key;
  }
  return 'outsourced';
}

/**
 * Returns true if the task is in the Staging Area section.
 * Jobs in Staging are treated as complete even if Asana hasn't marked them done.
 */
export function isInStaging(task) {
  return task.memberships?.some(m => m.section?.gid === STAGING_SECTION_GID) ?? false;
}

/**
 * Returns true if the task has been reviewed — it left the Unreviewed section.
 * Moving a job out of Unreviewed into any work section (Channel Letters,
 * Fabrication, Outsourced, etc.) counts as reviewed.
 */
export function isReviewed(task) {
  const inUnreviewed = task.memberships?.some(m => m.section?.gid === UNREVIEWED_SECTION_GID) ?? false;
  return !inUnreviewed;
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

  // Fetch from Jan 1 of current year to cover all periods
  const scheduleSince = `${year}-01-01`;

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
  // Count completed this week — includes both Asana-completed AND staged tasks
  const asanaCompletedThisWeek = completedTasksOnly.filter(t =>
    t.completed_at && t.completed_at.slice(0, 10) >= sevenDaysAgo
  ).length;
  // Staged jobs count as completed "today" since we don't know when they moved to staging
  const stagedCount = incompleteTasks.filter(t => isInStaging(t)).length;
  const completedThisWeek = asanaCompletedThisWeek + stagedCount;

  // 1b. Fetch reschedule counts for all incomplete tasks
  const rescheduleCounts = await getRescheduleCounts(incompleteTasks);

  // 2. Count how many production sub-tasks each parent main task has
  //    (>1 means PM/Sales redo)
  const parentSubtaskCount = {};
  for (const t of incompleteTasks) {
    const pgid = t.parent?.gid;
    if (pgid) parentSubtaskCount[pgid] = (parentSubtaskCount[pgid] ?? 0) + 1;
  }

  // 3. Fetch sub-sub-tasks for active production sub-tasks (skip staged)
  //    Each call is a lightweight GET — bump concurrency to 10 for speed.
  const subSubTaskMap = {};
  const tasksNeedingSubs = incompleteTasks.filter(t => !isInStaging(t));
  const subLimit = pLimit(10);
  await Promise.all(
    tasksNeedingSubs.map(t =>
      subLimit(() =>
        getSubtasks(t.gid, SUBSUBTASK_FIELDS).then(subs => {
          subSubTaskMap[t.gid] = subs.map(s => ({
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

  // 4. Build job records
  //    Jobs in the Staging Area are treated as complete even if Asana
  //    hasn't marked them done — they're finished with production.
  const allJobRecords = incompleteTasks
    .filter(t => t.parent?.gid)
    .map(t => {
      const subTasks = subSubTaskMap[t.gid] ?? [];
      const count = parentSubtaskCount[t.parent.gid] ?? 1;
      const due_on = extractProductionDueDate(t);
      const promisedDate = extractPromisedDate(t);
      const staged = isInStaging(t);
      const status = staged ? 'staged' : deriveStatus(due_on, today);
      const reviewed = isReviewed(t);
      const drift = getRescheduleDrift(due_on, promisedDate);
      const isRescheduled = drift != null && drift > 0;
      return {
        gid:  t.gid,
        name: t.parent.name,
        due_on,
        startDate:    t.start_on ?? null,
        createdAt:    t.created_at ? t.created_at.slice(0, 10) : null,
        promisedDate,
        status,
        staged,
        reviewed,
        isRescheduled,
        driftDays: drift,
        driftSeverity: driftSeverity(drift),
        projectedLate: !staged && status !== 'late' && isProjectedLate(subTasks, today),
        redoType: detectRedoType(subTasks, count),
        department: inferDepartment(t),
        reschedules: rescheduleCounts[t.gid]?.count ?? 0,
        rescheduleLog: rescheduleCounts[t.gid]?.log ?? [],
        subTasks,
      };
    });

  // Separate staged jobs from active jobs — staged are effectively complete
  const stagedJobs = allJobRecords.filter(j => j.staged);
  const jobs = allJobRecords.filter(j => !j.staged);

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

  // Include staged jobs (not Asana-completed but production-complete) in the
  // completed pool for schedule stats. Use today as their completion date since
  // Asana doesn't have a completed_at for them.
  const stagedAsCompleted = incompleteTasks
    .filter(t => isInStaging(t))
    .map(t => ({
      ...normalizeDueDate(t),
      completed: true,
      completed_at: today + 'T00:00:00.000Z',
    }));
  const allCompletedForSchedule = [...completedTasksOnly, ...stagedAsCompleted];
  // Exclude staged from the "open" pool so they don't count as in-progress
  const openForSchedule = normalizedIncompleteTasks.filter(t => !isInStaging(t));

  const bss = (range) => buildScheduleStats(openForSchedule, allCompletedForSchedule, range, today);
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
      staged: stagedJobs.length,
      reviewed: jobs.filter(j => j.reviewed).length,
      unreviewed: jobs.filter(j => !j.reviewed).length,
      rescheduledJobs: jobs.filter(j => j.isRescheduled).length,
      rescheduledMild: jobs.filter(j => j.driftSeverity === 'mild').length,
      rescheduledModerate: jobs.filter(j => j.driftSeverity === 'moderate').length,
      rescheduledSevere: jobs.filter(j => j.driftSeverity === 'severe').length,
      totalReschedules: jobs.reduce((s, j) => s + j.reschedules, 0),
    },
    jobs,
    stagedJobs,
    departmentLoad,
    schedule,
  };
}
