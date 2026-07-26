import { kv } from '@vercel/kv';

const TRUCKS_KEY = 'trucks:list';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ ok: false, error: 'Missing truck id' });

  try {
    const trucks = (await kv.get(TRUCKS_KEY)) || [];
    const index = trucks.findIndex((t) => t.id === id);

    if (req.method === 'GET') {
      if (index === -1) return res.status(404).json({ ok: false, error: 'Truck not found' });
      const truck = trucks[index];
      const logs = (await kv.get(`trucks:log:${id}`)) || [];
      return res.status(200).json({ ok: true, data: { ...truck, logs } });
    }

    if (req.method === 'PUT') {
      if (index === -1) return res.status(404).json({ ok: false, error: 'Truck not found' });
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const existing = trucks[index];

      const updated = {
        ...existing,
        name: body.name ?? existing.name,
        vin: body.vin ?? existing.vin,
        year: body.year ?? existing.year,
        make: body.make ?? existing.make,
        model: body.model ?? existing.model,
        licensePlate: body.licensePlate ?? existing.licensePlate,
        currentMiles: body.currentMiles != null ? Number(body.currentMiles) : existing.currentMiles,
        currentHours: body.currentHours != null ? Number(body.currentHours) : existing.currentHours,
        thresholds: body.thresholds ?? existing.thresholds,
      };

      const newTrucks = trucks.map((t, i) => (i === index ? updated : t));
      await kv.set(TRUCKS_KEY, newTrucks);

      return res.status(200).json({ ok: true, data: updated });
    }

    if (req.method === 'DELETE') {
      if (index === -1) return res.status(404).json({ ok: false, error: 'Truck not found' });
      const newTrucks = trucks.filter((_, i) => i !== index);
      await kv.set(TRUCKS_KEY, newTrucks);
      // Also delete associated logs
      await kv.del(`trucks:log:${id}`);
      return res.status(200).json({ ok: true, data: { deleted: id } });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[trucks/id]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
