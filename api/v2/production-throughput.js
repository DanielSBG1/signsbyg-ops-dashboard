/**
 * v2/production-throughput — reads from Supabase instead of Asana API.
 */
import { cached } from '../_lib/cache.js';
import supabase from '../_lib/supabase.js';
import { PRODUCTION_PROJECT_GID } from '../_lib/production/constants.js';
import { classifyCompletion, bucketByWeek } from '../_lib/production/throughput.js';

const CACHE_TTL = 120;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  try {
    const data = await cached('prod:throughput:v2', CACHE_TTL, buildFromSupabase);
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[v2/production-throughput]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function buildFromSupabase() {
  const twentyEightDaysAgo = new Date(Date.now() - 28 * 86400000).toISOString();

  const { data, error } = await supabase
    .from('asana_tasks')
    .select('gid, name, due_on, completed, completed_at')
    .eq('project_gid', PRODUCTION_PROJECT_GID)
    .eq('completed', true)
    .gte('completed_at', twentyEightDaysAgo);

  if (error) throw new Error(`Supabase: ${error.message}`);

  const classified = (data || [])
    .filter(t => t.completed_at)
    .map(t => ({
      completedAt: t.completed_at,
      classification: classifyCompletion(t.completed_at, t.due_on ?? null),
    }));

  const weeks = bucketByWeek(classified);
  const totalOnTime = weeks.reduce((s, w) => s + w.onTime, 0);
  const totalLate = weeks.reduce((s, w) => s + w.late, 0);
  const total = totalOnTime + totalLate;
  const onTimeRate = total > 0 ? Math.round((totalOnTime / total) * 100) : null;

  return { weeks, onTimeRate };
}
