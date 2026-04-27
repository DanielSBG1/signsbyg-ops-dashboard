// api/_lib/audit.js
import { PM_PROJECTS } from './pm-projects.js';
import { pLimit } from '../concurrency.js';
import { getProjectTasks, getTaskStories, getSubtasks } from './asana.js';

const DANIEL_GID = '1205492312209736';

const AUDIT_TASK_FIELDS = [
  'gid', 'name', 'completed', 'due_on', 'created_at',
  'memberships.section.name',
  'custom_fields.name', 'custom_fields.display_value',
].join(',');

const STORY_FIELDS = 'type,created_at,created_by.gid';

const RECOMMENDED = {
  untitled:        'Move task to the correct section based on job scope',
  stale48:         'Add a comment with a status update',
  scope:           'Fill in the Scope custom field',
  contact:         'Fill in the Contact custom field',
  subtaskMismatch: 'Mark master task complete or advance job to next section',
  daniel:          "Reply to Daniel's instruction with an update",
  stale24:         'Add a comment with current status',
  dueSoon:         'Add a comment confirming plan for due date',
};

/**
 * Returns how many hours have elapsed since the last comment,
 * applying the weekend buffer: Friday/Saturday comment → clock starts Monday 00:00.
 */
export function getHoursStale(lastCommentAt, now = new Date()) {
  if (!lastCommentAt) return Infinity;
  const commentDate = new Date(lastCommentAt);
  const day = commentDate.getUTCDay(); // 0=Sun, 5=Fri, 6=Sat
  let clockStart = commentDate;
  if (day === 5) {
    // Friday → clock starts Monday 00:00 UTC (+3 days)
    clockStart = new Date(Date.UTC(
      commentDate.getUTCFullYear(),
      commentDate.getUTCMonth(),
      commentDate.getUTCDate() + 3,
      0, 0, 0, 0
    ));
  } else if (day === 6) {
    // Saturday → clock starts Monday 00:00 UTC (+2 days)
    clockStart = new Date(Date.UTC(
      commentDate.getUTCFullYear(),
      commentDate.getUTCMonth(),
      commentDate.getUTCDate() + 2,
      0, 0, 0, 0
    ));
  }
  return (now - clockStart) / 3_600_000;
}

/**
 * Classifies a single task against the audit rules.
 * Returns { flag, reasons, recommendedAction }
 * flag: 'urgent' | 'mislabeled' | 'red' | 'yellow' | 'green'
 *
 * urgent     = in untitled section AND no subtask work done (truly unprocessed)
 * mislabeled = in untitled section BUT subtasks have been worked on (processed, just filed wrong)
 */
export function classifyTask(task, stories, subtasks, now = new Date()) {
  const section = task.memberships?.[0]?.section?.name ?? '';
  const sectionLower = section.toLowerCase().trim();
  const isUntitled = !sectionLower || sectionLower.includes('untitled');

  if (isUntitled) {
    const hasWork = subtasks.some(s => s.completed);
    if (hasWork) {
      return {
        flag: 'mislabeled',
        reasons: ['Job is in an untitled section but work has been completed — needs to be moved to the correct section'],
        recommendedAction: 'Move this job to the correct pipeline section',
      };
    }
    return {
      flag: 'urgent',
      reasons: ['Job is in an untitled section and no work has been done — has not been processed'],
      recommendedAction: RECOMMENDED.untitled,
    };
  }

  const comments = stories.filter(s => s.type === 'comment');
  const lastComment = [...comments].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  )[0] ?? null;
  const hoursStale = getHoursStale(lastComment?.created_at, now);

  const scopeField   = (task.custom_fields ?? []).find(f => f.name?.toLowerCase() === 'scope');
  const contactField = (task.custom_fields ?? []).find(f => f.name?.toLowerCase() === 'contact');

  const reasons = [];
  const actions = [];

  // Red: no comment in 48 hours
  if (hoursStale > 48) {
    reasons.push('No comment in 48 hours');
    actions.push(RECOMMENDED.stale48);
  }

  // Red: blank scope field
  if (!scopeField?.display_value) {
    reasons.push('Scope field blank');
    actions.push(RECOMMENDED.scope);
  }

  // Red: blank contact field
  if (!contactField?.display_value) {
    reasons.push('Contact field blank');
    actions.push(RECOMMENDED.contact);
  }

  // Red: subtask mismatch
  if (!task.completed && subtasks.some(s => s.completed)) {
    reasons.push('Subtask marked complete but master task still open');
    actions.push(RECOMMENDED.subtaskMismatch);
  }

  // Red: unactioned Daniel instruction
  const danielComments = comments.filter(c => c.created_by?.gid === DANIEL_GID);
  if (danielComments.length > 0) {
    const lastDaniel = [...danielComments].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )[0];
    const pmRepliedAfter = comments.some(
      c => c.created_by?.gid !== DANIEL_GID &&
           new Date(c.created_at) > new Date(lastDaniel.created_at)
    );
    if (!pmRepliedAfter) {
      reasons.push('Unactioned instruction from Daniel');
      actions.push(RECOMMENDED.daniel);
    }
  }

  if (reasons.length > 0) {
    return { flag: 'red', reasons, recommendedAction: actions.join('; ') };
  }

  // Yellow: stale 24-48 hours
  if (hoursStale > 24) {
    reasons.push('Last comment was 24\u201348 hours ago');
    actions.push(RECOMMENDED.stale24);
  }

  // Yellow: due today or tomorrow
  if (task.due_on) {
    const todayStr = now.toISOString().slice(0, 10);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    if (task.due_on === todayStr || task.due_on === tomorrowStr) {
      reasons.push('Due today or tomorrow');
      actions.push(RECOMMENDED.dueSoon);
    }
  }

  if (reasons.length > 0) {
    return { flag: 'yellow', reasons, recommendedAction: actions.join('; ') };
  }

  return { flag: 'green', reasons: [], recommendedAction: null };
}

// Asana fetch + assembly

const FLAG_ORDER = { urgent: 0, mislabeled: 1, red: 2, yellow: 3, green: 4 };

async function auditPm(pm, now, limit) {
  const tasks = await getProjectTasks(pm.projectGid, AUDIT_TASK_FIELDS);
  const incomplete = tasks.filter(t => !t.completed);

  await Promise.all(
    incomplete.map(task =>
      limit(async () => {
        const [stories, subtasks] = await Promise.all([
          getTaskStories(task.gid, STORY_FIELDS),
          getSubtasks(task.gid, 'gid,completed'),
        ]);
        task._stories = stories;
        task._subtasks = subtasks;
      })
    )
  );

  const classified = incomplete
    .map(task => {
      const section = task.memberships?.[0]?.section?.name ?? '';
      const { flag, reasons, recommendedAction } = classifyTask(
        task, task._stories, task._subtasks, now
      );
      const comments = task._stories.filter(s => s.type === 'comment');
      const lastComment = [...comments].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      )[0] ?? null;
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
}

export async function buildPmAudit() {
  const now = new Date();
  const limit = pLimit(5);

  const results = await Promise.all(
    PM_PROJECTS.map(pm =>
      auditPm(pm, now, limit).catch(err => {
        console.error(`[pm-audit] ${pm.name} failed: ${err.message}`);
        return null;
      })
    )
  );

  return {
    generatedAt: now.toISOString(),
    pms: results.filter(Boolean),
  };
}
