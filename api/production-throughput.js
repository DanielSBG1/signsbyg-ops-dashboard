import { cached } from './_lib/cache.js';
import { buildThroughput } from './_lib/production/throughput.js';

const CACHE_TTL = 300; // 5 minutes — throughput changes less frequently

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  try {
    const data = await cached('prod:throughput', CACHE_TTL, buildThroughput);
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[production-throughput]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}
