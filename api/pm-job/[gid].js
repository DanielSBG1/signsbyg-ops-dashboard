import { getTask, getSubtasks, getTaskStories } from '../_lib/pm/asana.js';
import { computeHealthScore, scoreBand, scorePenalties } from '../_lib/pm/health.js';
import { GID_TO_DEPT } from '../_lib/pm/constants.js';

const TASK_FIELDS = [
  'gid', 'name', 'due_on', 'completed', 'modified_at',
  'assignee.name', 'memberships.project.gid',
].join(',');

const SUBTASK_FIELDS = [
  'gid', 'name', 'due_on', 'completed', 'modified_at',
  'assignee.name', 'memberships.project.gid',
].join(',');

const SUB_SUBTASK_FIELDS = 'gid,name,due_on,completed,assignee.name';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const { gid } = req.query;
  if (!gid || !/^\d+$/.test(gid)) {
    res.status(400).json({ ok: false, error: 'Invalid task GID' });
    return;
  }

  try {
    // Fetch main task and its immediate subtasks in parallel
    const [mainTask, rawSubtasks] = await Promise.all([
      getTask(gid, TASK_FIELDS),
      getSubtasks(gid, SUBTASK_FIELDS),
    ]);

    // Identify which department each subtask belongs to via project membership
    const subtasks = rawSubtasks.map(s => {
      const deptMembership = (s.memberships ?? []).find(m => GID_TO_DEPT[m.project?.gid]);
      return {
        ...s,
        department: deptMembership ? GID_TO_DEPT[deptMembership.project.gid] : null,
      };
    });

    // Fetch comment counts for design and permitting subtasks in parallel
    const commentSubs = subtasks.filter(
      s => s.department === 'design' || s.department === 'permitting'
    );
    await Promise.all(
      commentSubs.map(s =>
        getTaskStories(s.gid).then(stories => {
          s.commentCount = stories.filter(x => x.type === 'comment').length;
        })
      )
    );

    // Fetch production sub-subtasks (one level deeper) if production subtask exists and is active
    const prodSub = subtasks.find(s => s.department === 'production' && !s.completed);
    const productionSubtasks = prodSub
      ? await getSubtasks(prodSub.gid, SUB_SUBTASK_FIELDS)
      : [];

    // Compute health score and penalties
    const job = { mainTask, subtasks };
    const score = computeHealthScore(job);

    res.json({
      ok: true,
      data: {
        gid: mainTask.gid,
        name: mainTask.name,
        due_on: mainTask.due_on,
        modified_at: mainTask.modified_at,
        score,
        band: scoreBand(score),
        penalties: scorePenalties(job),
        subtasks: subtasks.map(s => ({
          gid: s.gid,
          name: s.name,
          department: s.department,
          due_on: s.due_on,
          completed: s.completed,
          modified_at: s.modified_at,
          assignee: s.assignee?.name ?? null,
          commentCount: s.commentCount ?? null,
        })),
        productionSubtasks: productionSubtasks.map(s => ({
          gid: s.gid,
          name: s.name,
          due_on: s.due_on,
          completed: s.completed,
          assignee: s.assignee?.name ?? null,
        })),
      },
    });
  } catch (err) {
    console.error('[pm-job]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}
