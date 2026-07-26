import { kv } from '@vercel/kv';
import crypto from 'crypto';

const TRUCKS_KEY = 'trucks:list';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const DEFAULT_THRESHOLDS = {
  oilChange: { miles: 5000, months: 6 },
  tires: { miles: 40000, months: 24 },
  inspection: { months: 12 },
  brakes: { miles: 30000, months: 18 },
  transmission: { miles: 60000, months: 36 },
};

export default async function handler(req, res) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const trucks = (await kv.get(TRUCKS_KEY)) || [];
      return res.status(200).json({ ok: true, data: trucks });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const trucks = (await kv.get(TRUCKS_KEY)) || [];

      const truck = {
        id: crypto.randomUUID(),
        name: body.name || 'Unnamed Truck',
        vin: body.vin || '',
        year: body.year || '',
        make: body.make || '',
        model: body.model || '',
        licensePlate: body.licensePlate || '',
        currentMiles: Number(body.currentMiles) || 0,
        currentHours: Number(body.currentHours) || 0,
        createdAt: new Date().toISOString(),
        thresholds: body.thresholds || DEFAULT_THRESHOLDS,
      };

      const updated = [...trucks, truck];
      await kv.set(TRUCKS_KEY, updated);

      return res.status(201).json({ ok: true, data: truck });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[trucks]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
