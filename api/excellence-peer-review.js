// api/excellence-peer-review.js
import { getCached, setCached } from './_lib/cache.js';
import { peerReviewKey } from './_lib/excellence/culture.js';

const REVIEW_TTL = 60 * 60 * 24 * 45; // 45 days

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'GET') {
    const period = req.query.period ?? currentMonthStr();
    const data   = await getCached(peerReviewKey(period));
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, data: data ?? [] });
  }

  if (req.method === 'POST') {
    const { period, reviewer, team, communication, accountability, attitude, processAdherence } = req.body ?? {};

    const validTeams = ['pm', 'sales', 'production', 'installation', 'admin'];
    if (!team || !validTeams.includes(team))
      return res.status(400).json({ ok: false, error: 'Invalid team' });
    if ([communication, accountability, attitude, processAdherence].some(v => typeof v !== 'number' || v < 1 || v > 10))
      return res.status(400).json({ ok: false, error: 'All dimensions must be 1–10' });

    const key      = peerReviewKey(period ?? currentMonthStr());
    const existing = (await getCached(key)) ?? [];

    const submission = {
      team,
      reviewer: reviewer ?? 'anonymous',
      communication,
      accountability,
      attitude,
      processAdherence,
      submittedAt: new Date().toISOString(),
    };

    const updated = [...existing, submission];
    await setCached(key, updated, REVIEW_TTL);

    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, data: submission });
  }

  res.status(405).json({ ok: false, error: 'Method not allowed' });
}
