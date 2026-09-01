import { getCached, setCached, cached } from './_lib/cache.js';
import { buildProductionMetrics } from './_lib/production/metrics.js';

const CACHE_TTL = 120; // seconds

/**
 * Strip job arrays from departmentLoad, keeping only counts.
 */
function toSlimDepartmentLoad(departmentLoad) {
  if (!departmentLoad) return departmentLoad;
  const slim = {};
  for (const [key, jobs] of Object.entries(departmentLoad)) {
    slim[key] = Array.isArray(jobs) ? jobs.length : jobs;
  }
  return slim;
}

/**
 * Strip subTasks from schedule period job arrays to reduce payload.
 */
function toSlimSchedule(schedule) {
  if (!schedule) return schedule;
  const slim = {};
  for (const [period, stats] of Object.entries(schedule)) {
    if (stats && Array.isArray(stats.jobs)) {
      const { jobs: _jobs, ...rest } = stats;
      slim[period] = rest;
    } else {
      slim[period] = stats;
    }
  }
  return slim;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  try {
    const bust = req.query.bust === '1';
    const includeFull = req.query.include === 'jobs';

    // Fast path: serve the pre-computed slim payload directly from KV
    if (!bust && !includeFull) {
      const precomputed = await getCached('prod:metrics:precomputed');
      if (precomputed) {
        res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
        return res.json({ ok: true, data: precomputed });
      }
    }

    if (includeFull) {
      // Full (drill-down) path — current behavior, separate cache key
      const data = bust
        ? await buildProductionMetrics()
        : await cached('prod:metrics:full', CACHE_TTL, buildProductionMetrics);
      res.setHeader('Cache-Control', bust ? 'no-store' : 'public, s-maxage=120, stale-while-revalidate=600');
      res.json({ ok: true, data });
    } else {
      // Slim (fast) path — derive from the full cache when available
      let slim = bust ? null : await getCached('prod:metrics');
      if (!slim) {
        const full = bust
          ? await buildProductionMetrics()
          : await cached('prod:metrics:full', CACHE_TTL, buildProductionMetrics);
        slim = {
          generatedAt: full.generatedAt,
          totals: full.totals,
          departmentLoad: toSlimDepartmentLoad(full.departmentLoad),
          schedule: toSlimSchedule(full.schedule),
        };
        if (!bust) await setCached('prod:metrics', slim, CACHE_TTL);
      }
      res.setHeader('Cache-Control', bust ? 'no-store' : 'public, s-maxage=120, stale-while-revalidate=600');
      res.json({ ok: true, data: slim });
    }
  } catch (err) {
    console.error('[production-metrics]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}
