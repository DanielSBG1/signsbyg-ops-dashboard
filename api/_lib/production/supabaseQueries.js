/**
 * Supabase query layer for production metrics.
 * Replaces Asana API calls with direct Postgres reads.
 *
 * All three queries run in parallel — total time is the slowest single query
 * (~50-100ms) instead of hundreds of sequential Asana API round-trips.
 */
import supabase from '../supabase.js';
import { PRODUCTION_PROJECT_GID, PRODUCTION_DUE_DATE_CF_GID } from './constants.js';

/**
 * Fetches all production tasks (incomplete + completed since a given date).
 * Returns them in the shape the buildProductionMetrics computation expects.
 */
export async function getProductionTasks(completedSince) {
  // Incomplete tasks in the production project
  const incompletePromise = supabase
    .from('asana_tasks')
    .select('*')
    .eq('project_gid', PRODUCTION_PROJECT_GID)
    .eq('completed', false);

  // Completed tasks since the given date
  const completedPromise = supabase
    .from('asana_tasks')
    .select('*')
    .eq('project_gid', PRODUCTION_PROJECT_GID)
    .eq('completed', true)
    .gte('completed_at', completedSince);

  const [incompleteRes, completedRes] = await Promise.all([incompletePromise, completedPromise]);

  if (incompleteRes.error) throw new Error(`Supabase incomplete tasks: ${incompleteRes.error.message}`);
  if (completedRes.error) throw new Error(`Supabase completed tasks: ${completedRes.error.message}`);

  return {
    incompleteTasks: (incompleteRes.data || []).map(normalizeTask),
    completedTasks: (completedRes.data || []).map(normalizeTask),
  };
}

/**
 * Fetches all sub-sub-tasks for a set of parent task GIDs in one query.
 * Returns a Map of parentGid → subtask[].
 */
export async function getSubSubTasks(parentGids) {
  if (parentGids.length === 0) return {};

  const { data, error } = await supabase
    .from('asana_subtasks')
    .select('*')
    .in('parent_gid', parentGids);

  if (error) throw new Error(`Supabase subtasks: ${error.message}`);

  const map = {};
  for (const s of data || []) {
    if (!map[s.parent_gid]) map[s.parent_gid] = [];
    map[s.parent_gid].push({
      name: s.name,
      due_on: s.due_on ?? null,
      completed: s.completed,
      completed_at: s.completed_at ? s.completed_at.slice(0, 10) : null,
      assignee: s.assignee_name ?? null,
    });
  }
  return map;
}

/**
 * Fetches all reschedule stories for a set of task GIDs in one query.
 * Returns analyzed reschedule data per task: { [gid]: { count, log, originalPromisedDate } }
 */
export async function getRescheduleDataFromStories(taskGids) {
  if (taskGids.length === 0) return {};

  const { data, error } = await supabase
    .from('asana_stories')
    .select('*')
    .in('task_gid', taskGids)
    .eq('resource_subtype', 'date_custom_field_changed')
    .eq('custom_field_gid', PRODUCTION_DUE_DATE_CF_GID)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Supabase stories: ${error.message}`);

  // Group stories by task
  const storyMap = {};
  for (const s of data || []) {
    if (!storyMap[s.task_gid]) storyMap[s.task_gid] = [];
    storyMap[s.task_gid].push({
      resource_subtype: s.resource_subtype,
      created_at: s.created_at,
      custom_field: { gid: s.custom_field_gid },
      old_date_value: s.old_value,
      new_date_value: s.new_value,
    });
  }

  // Analyze each task's stories using the same heuristic as rescheduleCache.js
  const result = {};
  for (const gid of taskGids) {
    const stories = storyMap[gid] || [];
    result[gid] = analyzeReschedules(stories);
  }
  return result;
}

// ── Internal helpers ────────────────────────────────────────

const CORRECTION_WINDOW_MS = 60 * 60 * 1000;
const MIN_LEAD_TIME_H = 48;
const RESCHEDULE_THRESHOLD_H = 48;

function analyzeReschedules(changes) {
  if (changes.length === 0) return { count: 0, log: [], originalPromisedDate: null };

  const initial = changes.find(s => !s.old_date_value?.due_on && s.new_date_value?.due_on);
  if (!initial) return { count: 0, log: [], originalPromisedDate: null };

  const originalPromisedDate = initial.new_date_value.due_on;
  const initTime = new Date(initial.created_at).getTime();
  const initDate = new Date(originalPromisedDate + 'T12:00:00Z').getTime();
  const initLeadH = (initDate - initTime) / (1000 * 60 * 60);

  if (initLeadH < MIN_LEAD_TIME_H) return { count: 0, log: [], originalPromisedDate };

  let count = 0;
  const log = [];

  for (const s of changes) {
    const oldDate = s.old_date_value?.due_on;
    const newDate = s.new_date_value?.due_on;
    if (!oldDate || !newDate) continue;

    const changeTime = new Date(s.created_at).getTime();
    const oldDateMs = new Date(oldDate + 'T12:00:00Z').getTime();

    if (changeTime - initTime < CORRECTION_WINDOW_MS) continue;
    const hoursRemaining = (oldDateMs - changeTime) / (1000 * 60 * 60);
    if (hoursRemaining < RESCHEDULE_THRESHOLD_H) {
      count++;
      log.push({ from: oldDate, to: newDate, changedAt: s.created_at });
    }
  }

  return { count, log, originalPromisedDate };
}

/**
 * Normalizes a Supabase row back to the shape the v1 computation functions expect.
 * The main difference: Supabase has denormalized columns (section_gid, parent_gid, etc.)
 * while the v1 code expects nested objects (t.parent.gid, t.memberships[0].section.gid).
 */
function normalizeTask(row) {
  return {
    gid: row.gid,
    name: row.name,
    due_on: row.due_on ?? null,
    start_on: row.start_on ?? null,
    completed: row.completed,
    completed_at: row.completed_at ?? null,
    created_at: row.created_at ?? null,
    modified_at: row.modified_at ?? null,
    parent: row.parent_gid ? { gid: row.parent_gid, name: row.parent_name } : null,
    assignee: row.assignee_name ? { name: row.assignee_name } : null,
    // Reconstruct memberships from denormalized columns + stored JSONB
    memberships: row.memberships && Array.isArray(row.memberships)
      ? row.memberships
      : row.section_gid
        ? [{ section: { gid: row.section_gid, name: row.section_name } }]
        : [],
    // custom_fields stored as JSONB array — pass through as-is
    custom_fields: Array.isArray(row.custom_fields)
      ? row.custom_fields
      : [],
  };
}
