import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const { password } = req.body ?? {};
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected) {
    console.error('[auth] DASHBOARD_PASSWORD env var not set');
    return res.status(500).json({ ok: false, error: 'Server misconfigured' });
  }

  if (!password || password !== expected) {
    return res.status(401).json({ ok: false });
  }

  const token = crypto
    .createHash('sha256')
    .update(password + Date.now())
    .digest('hex')
    .slice(0, 32);

  return res.status(200).json({ ok: true, token });
}
