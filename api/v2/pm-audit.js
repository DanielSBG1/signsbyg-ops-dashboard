/**
 * v2/pm-audit — reads from Supabase instead of Asana API.
 *
 * Replaces per-task story + subtask fetches (N+1 pattern) with
 * bulk Supabase queries. Expected response time: <300ms.
 */
import { cached } from '../_lib/cache.js';
import supabase from '../_lib/supabase.js';
import { PM_PROJECTS } from '../_lib/pm/pm-projects.js';
import { classifyTask } from '../_lib/pm/audit.js';

const CACHE_TTL = 60;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    const data = await cached('pm:audit:v2', CACHE_TTL, buildFromSupabase);
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[v2/pm-audit]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}

const FLAG_ORDER = { urgent: 0, mislabeled: 1, red: 2, yellow: 3, green: 4 };
const DANIEL_GID = '1205492312209736';

async function buildFromSupabase() {
  const now = new Date();
  const pmProjectGids = PM_PROJECTS.map(p => p.projectGid);

  // 1. Fetch all incomplete tasks across all PM projects
  const { data: allTasks, error: taskErr } = await supabase
    .from('asana_tasks')
    .select('*')
    .in('project_gid', pmProjectGids)
    .eq('completed', false);

  if (taskErr) throw new Error(`Supabase tasks: ${taskErr.message}`);

  const taskGids = (allTasks || []).map(t => t.gid);

  // 2. Parallel: fetch stories and subtasks for all tasks in bulk
  const [storiesRes, subtasksRes] = await Promise.all([
    taskGids.length > 0
      ? supabase
          .from('asana_stories')
          .select('task_gid, resource_subtype, created_at, created_by_gid, text_content')
          .in('task_gid', taskGids)
      : { data: [], error: null },
    taskGids.length > 0
      ? supabase
          .from('asana_subtasks')
          .select('parent_gid, gid, completed')
          .in('parent_gid', taskGids)
      : { data: [], error: null },
  ]);

  // Group stories by task
  const storyMap = {};
  for (const s of storiesRes.data || []) {
    if (!storyMap[s.task_gid]) storyMap[s.task_gid] = [];
    storyMap[s.task_gid].push({
      type: s.resource_subtype === 'comment' ? 'comment' : s.resource_subtype,
      created_at: s.created_at,
      created_by: s.created_by_gid ? { gid: s.created_by_gid } : null,
    });
  }

  // Group subtasks by parent
  const subtaskMap = {};
  for (const s of subtasksRes.data || []) {
    if (!subtaskMap[s.parent_gid]) subtaskMap[s.parent_gid] = [];
    subtaskMap[s.parent_gid].push({ gid: s.gid, completed: s.completed });
  }

  // 3. Process each PM
  const pms = PM_PROJECTS.map(pm => {
    const tasks = (allTasks || []).filter(t => t.project_gid === pm.projectGid);

    const classified = tasks
      .map(task => {
        // Reconstruct the task shape the classifyTask function expects
        const normalizedTask = {
          gid: task.gid,
          name: task.name,
          completed: task.completed,
          due_on: task.due_on,
          created_at: task.created_at,
          memberships: Array.isArray(task.memberships)
            ? task.memberships
            : task.section_name
              ? [{ section: { name: task.section_name } }]
              : [],
          custom_fields: Array.isArray(task.custom_fields) ? task.custom_fields : [],
        };

        const stories = storyMap[task.gid] || [];
        const subtasks = subtaskMap[task.gid] || [];

        const { flag, reasons, recommendedAction } = classifyTask(
          normalizedTask, stories, subtasks, now
        );

        const comments = stories.filter(s => s.type === 'comment');
        const lastComment = [...comments].sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at)
        )[0] ?? null;

        const section = normalizedTask.memberships?.[0]?.section?.name ?? '';

        return {
          gid: task.gid,
          name: task.name,
          section,
          flag,
          reasons,
          lastActivity: lastComment?.created_at ?? null,
          createdAt: task.created_at ?? null,
          dueOn: task.due_on ?? null,
          recommendedAction,
        };
      })
      .sort((a, b) => FLAG_ORDER[a.flag] - FLAG_ORDER[b.flag]);

    const counts = { urgent: 0, mislabeled: 0, red: 0, yellow: 0, green: 0 };
    for (const t of classified) counts[t.flag] = (counts[t.flag] ?? 0) + 1;

    return { name: pm.name, projectGid: pm.projectGid, counts, tasks: classified };
  });

  return {
    generatedAt: now.toISOString(),
    pms,
  };
}
