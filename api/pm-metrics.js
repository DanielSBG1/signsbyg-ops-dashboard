import { cached } from './_lib/cache.js';
import { buildPmMetrics } from './_lib/pm/metrics.js';

const CACHE_TTL = 120; // seconds

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  try {
    const bust = req.query.bust === '1';
    const data = bust
      ? await buildPmMetrics()
      : await cached('pm:metrics', CACHE_TTL, buildPmMetrics);
    // bust=1 bypasses KV for manual refresh — don't let CDN cache that response
    res.setHeader('Cache-Control', bust ? 'no-store' : 'public, s-maxage=120, stale-while-revalidate=600');
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[pm-metrics]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}
