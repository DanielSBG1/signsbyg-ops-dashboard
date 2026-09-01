import { getCached, setCached, cached } from './_lib/cache.js';
import { buildPmMetrics } from './_lib/pm/metrics.js';

const CACHE_TTL = 120; // seconds

/**
 * Strip the heavy per-job arrays from departmentLoad, keeping only counts.
 */
function toSlimDepartmentLoad(departmentLoad) {
  if (!departmentLoad) return departmentLoad;
  const slim = {};
  for (const [key, dept] of Object.entries(departmentLoad)) {
    slim[key] = {
      label: dept.label,
      lead: dept.lead,
      count: dept.tasks?.length ?? 0,
      sectionOrder: dept.sectionOrder,
    };
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
      const precomputed = await getCached('pm:metrics:precomputed');
      if (precomputed) {
        res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
        return res.json({ ok: true, data: precomputed });
      }
    }

    if (includeFull) {
      // Full (drill-down) path — current behavior, separate cache key
      const data = bust
        ? await buildPmMetrics()
        : await cached('pm:metrics:full', CACHE_TTL, buildPmMetrics);
      res.setHeader('Cache-Control', bust ? 'no-store' : 'public, s-maxage=120, stale-while-revalidate=600');
      res.json({ ok: true, data });
    } else {
      // Slim (fast) path — derive from the full cache when available
      let slim = bust ? null : await getCached('pm:metrics');
      if (!slim) {
        const full = bust
          ? await buildPmMetrics()
          : await cached('pm:metrics:full', CACHE_TTL, buildPmMetrics);
        slim = {
          generatedAt: full.generatedAt,
          totals: full.totals,
          departmentLoad: toSlimDepartmentLoad(full.departmentLoad),
          schedule: full.schedule ?? null,
        };
        if (!bust) await setCached('pm:metrics', slim, CACHE_TTL);
      }
      res.setHeader('Cache-Control', bust ? 'no-store' : 'public, s-maxage=120, stale-while-revalidate=600');
      res.json({ ok: true, data: slim });
    }
  } catch (err) {
    console.error('[pm-metrics]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}
