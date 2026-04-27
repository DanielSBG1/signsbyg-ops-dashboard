/**
 * Read OpenPhone calls from the Vercel KV store populated by the webhook.
 *
 * Month-bucketed sorted sets make time-range queries cheap:
 *   op:call:index:2026-04 → ZRANGEBYSCORE(startMs, endMs)
 * Then hydrate each callId with its full record.
 */

import { kv } from '@vercel/kv';

function monthBuckets(startISO, endISO) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const buckets = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    buckets.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return buckets;
}

/**
 * Returns all call records in the given time range, sorted newest first.
 * Returns [] if KV not configured or empty.
 */
export async function getCallsFromStore(startISO, endISO) {
  if (!(process.env.KV_REST_API_URL || process.env.KV_URL)) return [];
  const buckets = monthBuckets(startISO, endISO);
  const startMs = Date.parse(startISO);
  const endMs = Date.parse(endISO);

  try {
    // Collect call IDs from all relevant month buckets
    const idSets = await Promise.all(
      buckets.map((b) =>
        kv.zrange(`op:call:index:${b}`, startMs, endMs, { byScore: true })
      )
    );
    const ids = [];
    for (const set of idSets) ids.push(...(set || []));
    if (ids.length === 0) return [];

    // Hydrate in parallel (batched via mget)
    const records = await Promise.all(ids.map((id) => kv.get(`op:call:${id}`)));
    const out = records.filter(Boolean);
    out.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
    return out;
  } catch (err) {
    console.warn(`[callsStore] read error: ${err.message}`);
    return [];
  }
}

/**
 * Get the earliest outbound activity timestamp for a specific phone since a
 * given time. Checks the phone-indexed sorted sets populated by the webhook
 * (both calls and messages). Returns ms timestamp or null.
 */
export async function getEarliestOutboundForPhone(phoneE164, sinceISO) {
  if (!(process.env.KV_REST_API_URL || process.env.KV_URL)) return null;
  if (!phoneE164) return null;
  const sinceMs = Date.parse(sinceISO) || 0;
  try {
    const key = `op:phone:out:${phoneE164}`;
    // Get the lowest score (earliest timestamp) >= sinceMs
    const results = await kv.zrange(key, sinceMs, Number.MAX_SAFE_INTEGER, {
      byScore: true,
      withScores: true,
      count: 1,
      offset: 0,
    });
    if (!results || results.length < 2) return null;
    return Number(results[1]);
  } catch (err) {
    console.warn(`[callsStore] getEarliestOutboundForPhone error: ${err.message}`);
    return null;
  }
}

/**
 * Returns true if the store has any calls at all — used by /api/calls to
 * decide whether to fall back to the polling approach.
 */
export async function storeHasAnyCalls() {
  if (!(process.env.KV_REST_API_URL || process.env.KV_URL)) return false;
  try {
    const currentMonth = new Date().toISOString().substring(0, 7);
    const count = await kv.zcard(`op:call:index:${currentMonth}`);
    return (count || 0) > 0;
  } catch {
    return false;
  }
}
