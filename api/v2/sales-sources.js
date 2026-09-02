import supabase from '../_lib/supabase.js';
import { getDateRange } from '../_lib/sales/periods.js';
import { classifySource } from '../_lib/sales/constants.js';
import { getCached, setCached } from '../_lib/cache.js';

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

    const cacheKey = `v2:sources:${period}:${customStart || ''}:${customEnd || ''}`;
    const hit = await getCached(cacheKey);
    if (hit) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return res.status(200).json(hit);
    }
    console.log(`[Cache MISS] ${cacheKey}`);

    const range = getDateRange(period, customStart, customEnd);

    const { data: contacts, error } = await supabase
      .from('hubspot_contacts')
      .select('id, properties, created_at')
      .gte('created_at', range.start)
      .lte('created_at', range.end);

    if (error) throw new Error(error.message);

    const breakdown = {};
    const dailyMap = {};
    const leadsMap = {};

    for (const row of contacts) {
      const props = row.properties ?? {};

      const src = classifySource(
        props.hs_analytics_source,
        props.hs_analytics_source_data_1
      );

      breakdown[src] = (breakdown[src] || 0) + 1;

      // Prefer HubSpot's own createdate for the day bucket; fall back to
      // our ingestion timestamp so nothing gets silently dropped.
      const rawDate = props.createdate || row.created_at;
      const day = rawDate ? rawDate.split('T')[0] : null;
      if (day) dailyMap[day] = (dailyMap[day] || 0) + 1;

      if (!leadsMap[src]) leadsMap[src] = [];
      const firstName = props.firstname || '';
      const lastName  = props.lastname  || '';
      const name = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';
      leadsMap[src].push({
        id: row.id,
        name,
        email: props.email || null,
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
    console.error('[v2/sources] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
