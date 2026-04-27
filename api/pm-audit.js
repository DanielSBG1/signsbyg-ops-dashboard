import { cached } from './_lib/cache.js';
import { buildPmAudit } from './_lib/pm/audit.js';

const CACHE_TTL = 120;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  try {
    const data = await cached('pm:audit', CACHE_TTL, buildPmAudit);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[pm-audit]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}
