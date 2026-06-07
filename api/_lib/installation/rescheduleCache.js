// File-based cache for Install Date reschedule counts per task.
// Structure: { taskGid: { count, lastCheckedAt, lastModifiedAt } }
//
// Rationale:
// - First build is slow for large task sets with rate limiting.
// - Completed tasks never recompute (reschedule count is frozen).
// - Open tasks only recompute when their Asana `modified_at` is newer than
//   what we last saw, so most refreshes hit only a handful of tasks.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTaskStories } from './asana.js';
import { FIELDS } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.join(__dirname, '..', '..', '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'reschedules.json');

const CORRECTION_WINDOW_MS  = 60 * 60 * 1000; // 1 hour
const MIN_LEAD_TIME_H        = 48;
const RESCHEDULE_THRESHOLD_H = 48;

function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function loadCache() {
  try {
    ensureDir();
    if (!fs.existsSync(CACHE_FILE)) return {};
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (err) {
    console.warn('Reschedule cache load failed, starting fresh:', err.message);
    return {};
  }
}

function saveCache(cache) {
  try {
    ensureDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.warn('Reschedule cache save failed:', err.message);
  }
}

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
 * Get reschedule counts for a list of tasks using the persisted cache.
 * Returns { [taskGid]: count }.
 *
 * Strategy:
 * - If task is cached AND (completed OR modified_at hasn't advanced) → use cache
 * - Otherwise → fetch stories and update cache
 */
export async function getRescheduleCounts(tasks, { onProgress } = {}) {
  const cache = loadCache();
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
    console.log(`[rescheduleCache] Fetching stories for ${tasksToFetch.length} tasks...`);
  }

  let done = 0;
  for (const t of tasksToFetch) {
    const gid = t.gid ?? t.id;
    try {
      const stories = await getTaskStories(gid);
      const count = countReschedulesFromStories(stories);
      cache[gid] = {
        count,
        lastCheckedAt: new Date().toISOString(),
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

  // Save cache once at the end to reduce disk churn.
  saveCache(cache);

  return result;
}
