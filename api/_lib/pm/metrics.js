import { DEPARTMENTS } from './constants.js';
import { getProjectTasks, getTask, getTaskStories } from './asana.js';
import { computeHealthScore, scoreBand, scorePenalties } from './health.js';
import { pLimit } from '../concurrency.js';

const DEPT_TASK_FIELDS = [
  'gid', 'name', 'due_on', 'completed', 'modified_at',
  'parent.gid', 'parent.name', 'assignee.name',
  'memberships.project.gid', 'memberships.section.name',
].join(',');

const MAIN_TASK_FIELDS = [
  'gid', 'name', 'due_on', 'modified_at', 'completed',
  'custom_fields.gid', 'custom_fields.name', 'custom_fields.display_value',
].join(',');

/**
 * Fetches comment count for a task GID.
 * Returns an integer (filters stories to type==='comment').
 */
async function fetchCommentCount(taskGid) {
  const stories = await getTaskStories(taskGid);
  return stories.filter(s => s.type === 'comment').length;
}

/**
 * Core data assembly function.
 * Called by the pm-metrics API handler (wrapped in cache).
 * Returns the full response payload.
 */
export async function buildPmMetrics() {
  const limit = pLimit(5);
  const deptEntries = Object.entries(DEPARTMENTS);

  // 1. Fetch incomplete tasks from all 5 department projects in parallel
  const deptTaskArrays = await Promise.all(
    deptEntries.map(([key, { projectGid }]) =>
      limit(() =>
        getProjectTasks(projectGid, DEPT_TASK_FIELDS).then(tasks =>
          tasks.map(t => ({ ...t, department: key }))
        )
      )
    )
  );
  const allDeptTasks = deptTaskArrays.flat();

  // 2. Collect unique parent GIDs (main task GIDs)
  const parentGids = [
    ...new Set(
      allDeptTasks.filter(t => t.parent?.gid).map(t => t.parent.gid)
    ),
  ];

  // 3. Batch-fetch parent main tasks in parallel (max 5 concurrent to avoid rate limit)
  const mainTaskMap = {};
  await Promise.all(
    parentGids.map(gid =>
      limit(() => getTask(gid, MAIN_TASK_FIELDS).then(t => { mainTaskMap[gid] = t; }))
    )
  );

  // 4. Fetch comment counts for Design and Permitting department tasks in parallel
  const commentTasks = allDeptTasks.filter(
    t => t.department === 'design' || t.department === 'permitting'
  );
  await Promise.all(
    commentTasks.map(t =>
      limit(() => fetchCommentCount(t.gid).then(count => { t.commentCount = count; }))
    )
  );

  // 5. Group department tasks by parent main task GID
  const jobMap = {};
  for (const deptTask of allDeptTasks) {
    const parentGid = deptTask.parent?.gid;
    if (!parentGid || !mainTaskMap[parentGid]) continue; // skip orphaned tasks
    if (!jobMap[parentGid]) {
      jobMap[parentGid] = {
        gid: parentGid,
        mainTask: mainTaskMap[parentGid],
        subtasks: [],
      };
    }
    jobMap[parentGid].subtasks.push({
      gid: deptTask.gid,
      name: deptTask.name,
      department: deptTask.department,
      due_on: deptTask.due_on,
      completed: deptTask.completed,
      modified_at: deptTask.modified_at,
      assignee: deptTask.assignee?.name ?? null,
      commentCount: deptTask.commentCount ?? null,
    });
  }

  // 6. Compute health scores for all jobs
  const jobs = Object.values(jobMap).map(job => {
    const score = computeHealthScore(job);
    const band = scoreBand(score);
    return {
      gid: job.gid,
      name: job.mainTask.name,
      due_on: job.mainTask.due_on,
      modified_at: job.mainTask.modified_at,
      score,
      band,
      hasRedo: job.subtasks.some(s => s.name.toUpperCase().includes('REDO')),
      hasOverdueSubtask: job.subtasks.some(
        s => !s.completed && s.due_on && s.due_on < new Date().toISOString().slice(0, 10)
      ),
      subtasks: job.subtasks,
    };
  });

  // 7. Sort scorecards: worst score first
  const scorecards = [...jobs].sort((a, b) => a.score - b.score);

  // 8. Build department load view (sorted: overdue first → due soonest → no date last)
  const today = new Date().toISOString().slice(0, 10);
  function sortTasks(tasks) {
    return [...tasks].sort((a, b) => {
      const aOver = a.due_on && a.due_on < today;
      const bOver = b.due_on && b.due_on < today;
      if (aOver !== bOver) return aOver ? -1 : 1;
      if (!a.due_on && !b.due_on) return 0;
      if (!a.due_on) return 1;
      if (!b.due_on) return -1;
      return a.due_on < b.due_on ? -1 : 1;
    });
  }

  const departmentLoad = {};
  for (const [key, dept] of deptEntries) {
    const tasks = allDeptTasks
      .filter(t => t.department === key)
      .map(t => ({
        gid: t.gid,
        name: t.name,
        due_on: t.due_on,
        modified_at: t.modified_at,
        assignee: t.assignee?.name ?? null,
        parentGid: t.parent?.gid ?? null,
        isRedo: t.name.toUpperCase().includes('REDO'),
        // Find the section belonging specifically to this department's project,
        // not any other project the task may be multi-homed in (e.g. a PM project)
        section: (t.memberships ?? []).find(m => m.project?.gid === dept.projectGid)?.section?.name ?? null,
      }));

    // Capture section order from Asana before tasks are sorted by due date
    const sectionOrder = [];
    const seenSections = new Set();
    for (const t of tasks) {
      const s = t.section;
      if (s && !seenSections.has(s)) { sectionOrder.push(s); seenSections.add(s); }
    }

    departmentLoad[key] = {
      label: dept.label,
      lead: dept.lead,
      tasks: sortTasks(tasks),
      sectionOrder,
    };
  }

  // 9. Build totals
  const totals = {
    active: jobs.length,
    onTrack: jobs.filter(j => j.band === 'healthy').length,
    atRisk: jobs.filter(j => j.band === 'watch' || j.band === 'risk').length,
    critical: jobs.filter(j => j.band === 'critical').length,
    redos: jobs.filter(j => j.hasRedo).length,
    overdueSubtasks: allDeptTasks.filter(
      t => !t.completed && t.due_on && t.due_on < today
    ).length,
  };

  return {
    generatedAt: new Date().toISOString(),
    totals,
    scorecards,
    departmentLoad,
  };
}
