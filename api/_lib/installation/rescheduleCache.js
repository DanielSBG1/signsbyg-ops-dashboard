// Vercel KV-backed cache for Install Date reschedule counts per task.
// Structure stored in KV: { [taskGid]: { count, lastModifiedAt } }
//
// Previous version used filesystem (fs.writeFileSync) which fails on
// Vercel's read-only serverless filesystem — cache was lost every
// invocation, causing full story refetches on every cron run.
//
// Now uses Vercel KV (Redis) with a long TTL. Completed tasks never
// recompute. Open tasks only recompute when modified_at advances.

import { getCached, setCached } from '../cache.js';
import { getTaskStories } from './asana.js';
import { FIELDS } from './constants.js';

const KV_KEY = 'installation:reschedules:v3';
const KV_TTL = 60 * 60 * 24 * 7; // 7 days — reschedule data is stable

const CORRECTION_WINDOW_MS  = 60 * 60 * 1000; // 1 hour
const MIN_LEAD_TIME_H       = 48;
const RESCHEDULE_THRESHOLD_H = 48;

// Count reschedules using the 3-rule heuristic:
//   1. Correction window: changes within 1h of initial scheduling → not a reschedule
//   2. Lead time exemption: job first scheduled with <48h lead → no reschedules counted
//   3. 48h rule: a date change only counts if <48h remained before the old date
function countReschedulesFromStories(stories) {
  const changes = stories
    .filter(s =>
      s.resource_subtype === 'date_custom_field_changed' &&
      s.custom_field?.gid === FIELDS.INSTALL_DATE
    )
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (changes.length === 0) return 0;

  const initial = changes.find(s => !s.old_date_value?.due_on && s.new_date_value?.due_on);
  if (!initial) return 0;

  const initTime  = new Date(initial.created_at).getTime();
  const initDate  = new Date(initial.new_date_value.due_on + 'T12:00:00Z').getTime();
  const initLeadH = (initDate - initTime) / (1000 * 60 * 60);

  if (initLeadH < MIN_LEAD_TIME_H) return 0;

  let count = 0;
  for (const s of changes) {
    const oldDate = s.old_date_value?.due_on;
    const newDate = s.new_date_value?.due_on;
    if (!oldDate || !newDate) continue;

    const changeTime  = new Date(s.created_at).getTime();
    const oldDateMs   = new Date(oldDate + 'T12:00:00Z').getTime();

    if (changeTime - initTime < CORRECTION_WINDOW_MS) continue;

    const hoursRemaining = (oldDateMs - changeTime) / (1000 * 60 * 60);
    if (hoursRemaining < RESCHEDULE_THRESHOLD_H) count++;
  }

  return count;
}

/**
 * Get reschedule counts for a list of tasks using Vercel KV cache.
 * Returns { [taskGid]: count }.
 *
 * Strategy:
 * - If task is cached AND (completed OR modified_at hasn't advanced) → use cache
 * - Otherwise → fetch stories and update cache
 */
export async function getRescheduleCounts(tasks, { onProgress } = {}) {
  const cache = (await getCached(KV_KEY)) || {};
  const result = {};
  const tasksToFetch = [];

  for (const t of tasks) {
    const gid = t.gid ?? t.id;
    const cached = cache[gid];
    const stillValid =
      cached &&
      (t.completed ||
        (t.modified_at && cached.lastModifiedAt === t.modified_at));

    if (stillValid) {
      result[gid] = cached.count;
    } else {
      tasksToFetch.push(t);
    }
  }

  if (tasksToFetch.length > 0) {
    console.log(`[rescheduleCache] Fetching stories for ${tasksToFetch.length} tasks (${Object.keys(result).length} cached)...`);
  } else {
    console.log(`[rescheduleCache] All ${Object.keys(result).length} tasks cached — no stories to fetch`);
  }

  let done = 0;
  for (const t of tasksToFetch) {
    const gid = t.gid ?? t.id;
    try {
      const stories = await getTaskStories(gid);
      const count = countReschedulesFromStories(stories);
      cache[gid] = {
        count,
        lastModifiedAt: t.modified_at || null,
      };
      result[gid] = count;
    } catch (err) {
      console.warn(`[rescheduleCache] Fetch failed for task ${gid}: ${err.message}`);
      result[gid] = cache[gid]?.count ?? 0;
    }

    done += 1;
    if (onProgress && done % 20 === 0) onProgress(done, tasksToFetch.length);
  }

  // Save to KV once at the end
  await setCached(KV_KEY, cache, KV_TTL);

  return result;
}
