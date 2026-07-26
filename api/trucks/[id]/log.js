import { kv } from '@vercel/kv';
import crypto from 'crypto';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ ok: false, error: 'Missing truck id' });

  const logKey = `trucks:log:${id}`;

  try {
    if (req.method === 'GET') {
      const logs = (await kv.get(logKey)) || [];
      return res.status(200).json({ ok: true, data: logs });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const logs = (await kv.get(logKey)) || [];

      const entry = {
        id: crypto.randomUUID(),
        truckId: id,
        type: body.type || 'other',
        date: body.date || new Date().toISOString().slice(0, 10),
        miles: Number(body.miles) || 0,
        hours: Number(body.hours) || 0,
        cost: Number(body.cost) || 0,
        vendor: body.vendor || '',
        notes: body.notes || '',
        createdAt: new Date().toISOString(),
      };

      const updated = [...logs, entry];
      await kv.set(logKey, updated);

      return res.status(201).json({ ok: true, data: entry });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[trucks/id/log]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
