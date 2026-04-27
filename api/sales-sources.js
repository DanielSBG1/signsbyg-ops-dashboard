import { getContactsInRange } from './_lib/sales/hubspot.js';
import { getDateRange } from './_lib/sales/periods.js';
import { classifySource } from './_lib/sales/constants.js';
import { getCached, setCached } from './_lib/cache.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

    const { period = 'month', start: customStart, end: customEnd } = req.query;

    if (period === 'custom' && (!customStart || !customEnd)) {
      return res.status(400).json({ error: 'Custom period requires start and end query params' });
    }

    const cacheKey = `sourcesv2:${period}:${customStart || ''}:${customEnd || ''}`;
    const hit = await getCached(cacheKey);
    if (hit) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return res.status(200).json(hit);
    }
    console.log(`[Cache MISS] ${cacheKey}`);

    const range = getDateRange(period, customStart, customEnd);
    const contacts = await getContactsInRange(range.start, range.end);

    const breakdown = {};
    const dailyMap = {};
    const leadsMap = {};

    for (const c of contacts.results) {
      const src = classifySource(
        c.properties.hs_analytics_source,
        c.properties.hs_analytics_source_data_1
      );
      breakdown[src] = (breakdown[src] || 0) + 1;

      const day = c.properties.createdate?.split('T')[0];
      if (day) dailyMap[day] = (dailyMap[day] || 0) + 1;

      if (!leadsMap[src]) leadsMap[src] = [];
      const firstName = c.properties.firstname || '';
      const lastName = c.properties.lastname || '';
      const name = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';
      leadsMap[src].push({
        id: c.id,
        name,
        email: c.properties.email || null,
        createdAt: day || null,
      });
    }

    const daily = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    const result = { breakdown, daily, leads: leadsMap };

    await setCached(cacheKey, result, 60);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[sources] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
