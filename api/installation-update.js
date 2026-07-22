import { updateTaskInstallDate } from './_lib/installation/asana.js';
import { setCached } from './_lib/cache.js';

const CACHE_KEY = 'installation:metrics:v3';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const { taskGid, installDate, startDate } = req.body ?? {};

  if (!taskGid || typeof taskGid !== 'string') {
    return res.status(400).json({ error: 'taskGid is required' });
  }
  if (installDate && !/^\d{4}-\d{2}-\d{2}$/.test(installDate)) {
    return res.status(400).json({ error: 'installDate must be YYYY-MM-DD or omitted to clear' });
  }
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return res.status(400).json({ error: 'startDate must be YYYY-MM-DD or omitted' });
  }

  try {
    await updateTaskInstallDate(taskGid, installDate ?? null, startDate);
    // Bust the cache so the next poll picks up the change
    await setCached(CACHE_KEY, null, 1);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[installation-update] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
