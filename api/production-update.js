import { updateTaskDueDate } from './_lib/production/asana.js';
import { setCached } from './_lib/cache.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const { taskGid, dueDate, startDate } = req.body ?? {};
  if (!taskGid) return res.status(400).json({ error: 'taskGid is required' });

  try {
    await updateTaskDueDate(taskGid, dueDate ?? null, startDate);
    await setCached('prod:metrics', null, 1);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[production-update]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
