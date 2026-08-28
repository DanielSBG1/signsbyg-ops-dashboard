// Vercel KV-backed cache for Production Due Date reschedule counts per task.
// Structure stored in KV: { [taskGid]: { count, log, lastModifiedAt } }
//
// Ports the installation reschedule cache pattern to production.
// Tracks changes to the "Production Due Date" custom field and applies
// the same 3-rule heuristic to filter out non-meaningful date changes.

import { getCached, setCached } from '../cache.js';
import { getTaskStories } from './asana.js';
import { PRODUCTION_DUE_DATE_CF_GID } from './constants.js';

const KV_KEY = 'production:reschedules:v2';
const KV_TTL = 60 * 60 * 24 * 7; // 7 days — reschedule data is stable

const CORRECTION_WINDOW_MS   = 60 * 60 * 1000; // 1 hour
const MIN_LEAD_TIME_H        = 48;
const RESCHEDULE_THRESHOLD_H = 48;

/**
 * Count reschedules + collect a log using the 3-rule heuristic:
 *   1. Correction window: changes within 1h of initial scheduling -> not a reschedule
 *   2. Lead time exemption: job first scheduled with <48h lead -> no reschedules counted
 *   3. 48h rule: a date change only counts if <48h remained before the old date
 *
 * Returns { count: number, log: [{ from, to, changedAt }] }
 */
function analyzeReschedulesFromStories(stories) {
  const changes = stories
    .filter(s =>
      s.resource_subtype === 'date_custom_field_changed' &&
      s.custom_field?.gid === PRODUCTION_DUE_DATE_CF_GID
    )
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (changes.length === 0) return { count: 0, log: [], originalPromisedDate: null };

  // Find the initial scheduling event (old date null -> new date set)
  // This is the ORIGINAL promised date — the first date ever entered.
  const initial = changes.find(s => !s.old_date_value?.due_on && s.new_date_value?.due_on);
  if (!initial) return { count: 0, log: [], originalPromisedDate: null };

  const originalPromisedDate = initial.new_date_value.due_on;
  const initTime  = new Date(initial.created_at).getTime();
  const initDate  = new Date(originalPromisedDate + 'T12:00:00Z').getTime();
  const initLeadH = (initDate - initTime) / (1000 * 60 * 60);

  // Rule 2: Lead time exemption — job first scheduled with <48h lead
  if (initLeadH < MIN_LEAD_TIME_H) return { count: 0, log: [], originalPromisedDate };

  let count = 0;
  const log = [];

  for (const s of changes) {
    const oldDate = s.old_date_value?.due_on;
    const newDate = s.new_date_value?.due_on;
    if (!oldDate || !newDate) continue;

    const changeTime = new Date(s.created_at).getTime();
    const oldDateMs  = new Date(oldDate + 'T12:00:00Z').getTime();

    // Rule 1: Correction window — changes within 1h of initial scheduling
    if (changeTime - initTime < CORRECTION_WINDOW_MS) continue;

    // Rule 3: 48h rule — only count if <48h remained before the old date
    const hoursRemaining = (oldDateMs - changeTime) / (1000 * 60 * 60);
    if (hoursRemaining < RESCHEDULE_THRESHOLD_H) {
      count++;
      log.push({
        from: oldDate,
        to: newDate,
        changedAt: s.created_at,
      });
    }
  }

  return { count, log, originalPromisedDate };
}

/**
 * Get reschedule counts + logs for a list of tasks using Vercel KV cache.
 * Returns { [taskGid]: { count, log } }.
 *
 * Strategy:
 * - If task is cached AND (completed OR modified_at hasn't advanced) -> use cache
 * - Otherwise -> fetch stories and update cache
 */
export async function getRescheduleCounts(tasks) {
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
      result[gid] = { count: cached.count, log: cached.log ?? [], originalPromisedDate: cached.originalPromisedDate ?? null };
    } else {
      tasksToFetch.push(t);
    }
  }

  if (tasksToFetch.length > 0) {
    console.log(`[prod:rescheduleCache] Fetching stories for ${tasksToFetch.length} tasks (${Object.keys(result).length} cached)...`);
  } else {
    console.log(`[prod:rescheduleCache] All ${Object.keys(result).length} tasks cached — no stories to fetch`);
  }

  for (const t of tasksToFetch) {
    const gid = t.gid ?? t.id;
    try {
      const stories = await getTaskStories(gid);
      const { count, log, originalPromisedDate } = analyzeReschedulesFromStories(stories);
      cache[gid] = {
        count,
        log,
        originalPromisedDate,
        lastModifiedAt: t.modified_at || null,
      };
      result[gid] = { count, log, originalPromisedDate };
    } catch (err) {
      console.warn(`[prod:rescheduleCache] Fetch failed for task ${gid}: ${err.message}`);
      result[gid] = {
        count: cache[gid]?.count ?? 0,
        log: cache[gid]?.log ?? [],
        originalPromisedDate: cache[gid]?.originalPromisedDate ?? null,
      };
    }
  }

  // Save to KV once at the end
  await setCached(KV_KEY, cache, KV_TTL);

  return result;
}
