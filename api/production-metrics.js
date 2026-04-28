import { cached } from './_lib/cache.js';
import { buildProductionMetrics } from './_lib/production/metrics.js';

const CACHE_TTL = 120; // seconds

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  try {
    const data = await cached('prod:metrics', CACHE_TTL, buildProductionMetrics);
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[production-metrics]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}
