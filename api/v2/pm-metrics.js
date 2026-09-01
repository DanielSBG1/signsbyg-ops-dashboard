/**
 * v2/pm-metrics — reads from Supabase instead of Asana API.
 *
 * Replaces ~100+ Asana API calls with 3 parallel Supabase queries.
 * Expected response time: <200ms (vs 15-30s for v1).
 */
import { cached } from '../_lib/cache.js';
import supabase from '../_lib/supabase.js';
import { DEPARTMENTS } from '../_lib/pm/constants.js';
import { computeHealthScore, scoreBand } from '../_lib/pm/health.js';

const CACHE_TTL = 60;

const DEPT_PROJECT_GIDS = Object.values(DEPARTMENTS).map(d => d.projectGid);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    const bust = req.query.bust === '1';
    const data = bust
      ? await buildFromSupabase()
      : await cached('pm:metrics:v2', CACHE_TTL, buildFromSupabase);
    res.setHeader('Cache-Control', bust ? 'no-store' : 'public, s-maxage=60, stale-while-revalidate=300');
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[v2/pm-metrics]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function buildFromSupabase() {
  const deptEntries = Object.entries(DEPARTMENTS);

  // 1. Fetch all incomplete tasks from the 5 department projects
  const { data: deptTasks, error: deptErr } = await supabase
    .from('asana_tasks')
    .select('*')
    .in('project_gid', DEPT_PROJECT_GIDS)
    .eq('completed', false);

  if (deptErr) throw new Error(`Supabase dept tasks: ${deptErr.message}`);

  // Tag each task with its department key
  const gidToDept = {};
  for (const [key, { projectGid }] of deptEntries) {
    gidToDept[projectGid] = key;
  }
  const taggedTasks = (deptTasks || []).map(t => ({
    ...t,
    department: gidToDept[t.project_gid] || 'unknown',
  }));

  // 2. Collect unique parent GIDs and fetch parent (main) tasks
  const parentGids = [...new Set(taggedTasks.filter(t => t.parent_gid).map(t => t.parent_gid))];

  // 3. Fetch comment counts for design/permitting tasks from stories
  const commentTaskGids = taggedTasks
    .filter(t => t.department === 'design' || t.department === 'permitting')
    .map(t => t.gid);

  const [parentRes, commentRes] = await Promise.all([
    parentGids.length > 0
      ? supabase.from('asana_tasks').select('*').in('gid', parentGids)
      : { data: [], error: null },
    commentTaskGids.length > 0
      ? supabase
          .from('asana_stories')
          .select('task_gid')
          .in('task_gid', commentTaskGids)
          .eq('resource_subtype', 'comment')
      : { data: [], error: null },
  ]);

  if (parentRes.error) throw new Error(`Supabase parent tasks: ${parentRes.error.message}`);

  // Build parent task lookup
  const mainTaskMap = {};
  for (const t of parentRes.data || []) {
    mainTaskMap[t.gid] = {
      gid: t.gid,
      name: t.name,
      due_on: t.due_on,
      modified_at: t.modified_at,
      completed: t.completed,
      custom_fields: Array.isArray(t.custom_fields) ? t.custom_fields : [],
    };
  }

  // Build comment count lookup
  const commentCounts = {};
  for (const row of commentRes.data || []) {
    commentCounts[row.task_gid] = (commentCounts[row.task_gid] || 0) + 1;
  }

  // Tag comment counts onto tasks
  for (const t of taggedTasks) {
    if (commentCounts[t.gid] !== undefined) {
      t.commentCount = commentCounts[t.gid];
    }
  }

  // 4. Group department tasks by parent main task GID
  const jobMap = {};
  for (const deptTask of taggedTasks) {
    const parentGid = deptTask.parent_gid;
    if (!parentGid || !mainTaskMap[parentGid]) continue;
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
      assignee: deptTask.assignee_name ?? null,
      commentCount: deptTask.commentCount ?? null,
    });
  }

  // 5. Compute health scores for all jobs
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

  // 6. Sort scorecards: worst score first
  const scorecards = [...jobs].sort((a, b) => a.score - b.score);

  // 7. Build department load view
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
    const tasks = taggedTasks
      .filter(t => t.department === key)
      .map(t => {
        // Reconstruct memberships to find the section in this department's project
        const memberships = Array.isArray(t.memberships) ? t.memberships : [];
        const deptMembership = memberships.find(m => m.project?.gid === dept.projectGid);
        const section = deptMembership?.section?.name ?? t.section_name ?? null;

        return {
          gid: t.gid,
          name: t.name,
          due_on: t.due_on,
          modified_at: t.modified_at,
          assignee: t.assignee_name ?? null,
          parentGid: t.parent_gid ?? null,
          isRedo: t.name.toUpperCase().includes('REDO'),
          section,
        };
      });

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

  // 8. Build totals
  const totals = {
    active: jobs.length,
    onTrack: jobs.filter(j => j.band === 'healthy').length,
    atRisk: jobs.filter(j => j.band === 'watch' || j.band === 'risk').length,
    critical: jobs.filter(j => j.band === 'critical').length,
    redos: jobs.filter(j => j.hasRedo).length,
    overdueSubtasks: taggedTasks.filter(
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
