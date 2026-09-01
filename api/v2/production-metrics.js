/**
 * v2/production-metrics — reads from Supabase instead of Asana API.
 *
 * Same response shape as v1, but backed by 3 parallel Postgres queries
 * instead of hundreds of sequential Asana API calls.
 * Expected response time: <200ms (vs 10-20s for v1).
 */
import { cached } from '../_lib/cache.js';
import {
  getProductionTasks,
  getSubSubTasks,
  getRescheduleDataFromStories,
} from '../_lib/production/supabaseQueries.js';
import {
  STAGING_SECTION_GID,
  UNREVIEWED_SECTION_GID,
  PROMISED_DATE_CF_GID,
  DEPT_SECTION_MAP,
  REDO_PREFIX,
} from '../_lib/production/constants.js';
import {
  getWeekRange,
  buildScheduleStats,
  extractProductionDueDate,
  extractPromisedDate,
  getRescheduleDrift,
  driftSeverity,
  deriveStatus,
  isProjectedLate,
  detectRedoType,
  inferDepartment,
  isInStaging,
  isReviewed,
} from '../_lib/production/metrics.js';

const CACHE_TTL = 60; // shorter TTL since Supabase reads are fast

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const bust = req.query.bust === '1';
    const data = bust
      ? await buildFromSupabase()
      : await cached('prod:metrics:v2', CACHE_TTL, buildFromSupabase);

    res.setHeader('Cache-Control', bust ? 'no-store' : 'public, s-maxage=60, stale-while-revalidate=300');
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[v2/production-metrics]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function buildFromSupabase() {
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const month = today.slice(5, 7);

  // Date ranges (pure computation — same as v1)
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
  const quarterEnds = ['03-31', '06-30', '09-30', '12-31'];
  const thisQuarterRange = {
    start: `${year}-${quarterStarts[currentQuarter - 1]}`,
    end: `${year}-${quarterEnds[currentQuarter - 1]}`,
  };

  // ── PHASE 1: Parallel Supabase queries ──
  // This replaces the v1's sequential Asana API calls.
  // 3 queries in ~100ms total instead of 10-20s.
  const scheduleSince = `${year}-01-01T00:00:00.000Z`;
  const { incompleteTasks, completedTasks } = await getProductionTasks(scheduleSince);

  // Get all task GIDs for subtask + story queries
  const allTaskGids = incompleteTasks.filter(t => !isInStaging(t)).map(t => t.gid);

  const [subSubTaskMap, rescheduleData] = await Promise.all([
    getSubSubTasks(allTaskGids),
    getRescheduleDataFromStories(incompleteTasks.map(t => t.gid)),
  ]);

  // ── PHASE 2: Pure computation (identical to v1) ──

  const normalizeDueDate = t => ({ ...t, due_on: extractProductionDueDate(t) });
  const normalizedIncompleteTasks = incompleteTasks.map(normalizeDueDate);
  const completedTasksOnly = completedTasks.map(normalizeDueDate);

  const asanaCompletedThisWeek = completedTasksOnly.filter(t =>
    t.completed_at && t.completed_at.slice(0, 10) >= sevenDaysAgo
  ).length;
  const stagedCount = incompleteTasks.filter(t => isInStaging(t)).length;
  const completedThisWeek = asanaCompletedThisWeek + stagedCount;

  // Count parent subtasks for redo detection
  const parentSubtaskCount = {};
  for (const t of incompleteTasks) {
    const pgid = t.parent?.gid;
    if (pgid) parentSubtaskCount[pgid] = (parentSubtaskCount[pgid] ?? 0) + 1;
  }

  // Build job records
  const allJobRecords = incompleteTasks
    .filter(t => t.parent?.gid)
    .map(t => {
      const subTasks = subSubTaskMap[t.gid] ?? [];
      const count = parentSubtaskCount[t.parent.gid] ?? 1;
      const due_on = extractProductionDueDate(t);
      const staged = isInStaging(t);
      const status = staged ? 'staged' : deriveStatus(due_on, today);
      const reviewed = isReviewed(t);

      const rd = rescheduleData[t.gid] ?? { count: 0, log: [], originalPromisedDate: null };
      const promisedDate = rd.originalPromisedDate ?? extractPromisedDate(t);
      const drift = getRescheduleDrift(due_on, promisedDate);
      const isRescheduled = drift != null && drift > 0;

      return {
        gid: t.gid,
        name: t.parent.name,
        due_on,
        startDate: t.start_on ?? null,
        createdAt: t.created_at ? t.created_at.slice(0, 10) : null,
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
        reschedules: rd.count,
        rescheduleLog: rd.log,
        subTasks,
      };
    });

  const stagedJobs = allJobRecords.filter(j => j.staged);
  const jobs = allJobRecords.filter(j => !j.staged);

  jobs.sort((a, b) => {
    if (a.status === 'late' && b.status !== 'late') return -1;
    if (b.status === 'late' && a.status !== 'late') return 1;
    if (!a.due_on && !b.due_on) return 0;
    if (!a.due_on) return 1;
    if (!b.due_on) return -1;
    return a.due_on < b.due_on ? -1 : 1;
  });

  const departmentLoad = { channel_letters: [], fabrication: [], vinyl_fco: [], outsourced: [] };
  for (const job of jobs) departmentLoad[job.department].push(job);

  // Schedule stats
  const stagedAsCompleted = incompleteTasks
    .filter(t => isInStaging(t))
    .map(t => ({ ...normalizeDueDate(t), completed: true, completed_at: today + 'T00:00:00.000Z' }));
  const allCompletedForSchedule = [...completedTasksOnly, ...stagedAsCompleted];
  const openForSchedule = normalizedIncompleteTasks.filter(t => !isInStaging(t));

  const driftMap = {};
  for (const j of allJobRecords) {
    driftMap[j.gid] = {
      driftDays: j.driftDays,
      driftSeverity: j.driftSeverity,
      promisedDate: j.promisedDate,
      isRescheduled: j.isRescheduled,
    };
  }

  const rescheduledThisWeek = allJobRecords.filter(j =>
    j.rescheduleLog.some(entry => entry.changedAt?.slice(0, 10) >= thisWeekRange.start)
  ).length;

  const bss = (range) => buildScheduleStats(openForSchedule, allCompletedForSchedule, range, today, driftMap);
  const schedule = {
    thisWeek: bss(thisWeekRange),
    nextWeek: bss(nextWeekRange),
    lastWeek: bss(lastWeekRange),
    twoWeeksAgo: bss(twoWeeksAgoRange),
    thisMonth: bss({ start: monthStart, end: monthEnd }),
    lastMonth: bss({ start: lastMonthStart, end: lastMonthEnd }),
    thisQuarter: bss(thisQuarterRange),
    q1: bss({ start: `${year}-01-01`, end: `${year}-03-31` }),
    q2: bss({ start: `${year}-04-01`, end: `${year}-06-30` }),
    q3: bss({ start: `${year}-07-01`, end: `${year}-09-30` }),
    q4: bss({ start: `${year}-10-01`, end: `${year}-12-31` }),
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
      rescheduledThisWeek,
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
