/**
 * v2/sales-calls — reads from Supabase openphone_calls table.
 *
 * Replaces the v1 endpoint that reads from KV webhook store + OpenPhone API.
 * Single Supabase query instead of per-phone-number API polling.
 * Expected response time: <200ms.
 */
import supabase from '../_lib/supabase.js';
import { getDateRange } from '../_lib/sales/periods.js';
import { getCached, setCached } from '../_lib/cache.js';

const CACHE_TTL = 120;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { period = 'today', start: customStart, end: customEnd } = req.query;
    const range = getDateRange(period, customStart, customEnd);

    const cacheKey = `calls:v2:${period}:${customStart || ''}:${customEnd || ''}`;
    const cached = await getCached(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
      return res.json(cached);
    }

    // Query calls from Supabase in the date range
    const { data: calls, error } = await supabase
      .from('openphone_calls')
      .select('*')
      .gte('created_at', range.start)
      .lte('created_at', range.end + 'T23:59:59.999Z')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Supabase: ${error.message}`);

    // Enrich call records
    const enriched = (calls || []).map((c) => ({
      id: c.id,
      direction: c.direction,
      status: c.status || (c.duration > 0 ? 'completed' : 'missed'),
      createdAt: c.created_at,
      duration: c.duration || 0,
      voicemail: c.has_voicemail,
      customerPhone: c.participant_phone,
      ourPhoneLabel: c.phone_number,
      rep: c.user_name,
      userId: c.user_id,
      classification: 'unknown', // Would need HubSpot lookup for full classification
    }));

    // Build summary
    const total = enriched.length;
    const inbound = enriched.filter((c) => c.direction === 'incoming').length;
    const outbound = enriched.filter((c) => c.direction === 'outgoing').length;
    const missed = enriched.filter((c) => c.status === 'missed' || c.voicemail).length;
    const answered = enriched.filter((c) => c.duration > 0 && !c.voicemail).length;
    const withDuration = enriched.filter((c) => c.duration > 0);
    const avgDuration = withDuration.length > 0
      ? Math.round(withDuration.reduce((s, c) => s + c.duration, 0) / withDuration.length)
      : 0;

    // Unique inbound callers
    const uniqueInbound = new Set(
      enriched.filter((c) => c.direction === 'incoming').map((c) => c.customerPhone)
    ).size;

    // By day breakdown
    const byDay = {};
    for (const c of enriched) {
      const day = c.createdAt?.slice(0, 10) || 'unknown';
      if (!byDay[day]) byDay[day] = { date: day, total: 0, inbound: 0, outbound: 0, missed: 0 };
      byDay[day].total++;
      if (c.direction === 'incoming') byDay[day].inbound++;
      if (c.direction === 'outgoing') byDay[day].outbound++;
      if (c.status === 'missed' || c.voicemail) byDay[day].missed++;
    }

    // By rep breakdown
    const byRep = {};
    for (const c of enriched) {
      const rep = c.rep || 'Unknown';
      if (!byRep[rep]) byRep[rep] = { name: rep, total: 0, inbound: 0, outbound: 0, avgDuration: 0, totalDuration: 0 };
      byRep[rep].total++;
      if (c.direction === 'incoming') byRep[rep].inbound++;
      if (c.direction === 'outgoing') byRep[rep].outbound++;
      byRep[rep].totalDuration += c.duration;
    }
    for (const rep of Object.values(byRep)) {
      rep.avgDuration = rep.total > 0 ? Math.round(rep.totalDuration / rep.total) : 0;
      delete rep.totalDuration;
    }

    const result = {
      period: { start: range.start, end: range.end, label: range.label },
      calls: enriched,
      summary: {
        total,
        inbound,
        outbound,
        missed,
        voicemail: enriched.filter((c) => c.voicemail).length,
        answered,
        avgDuration,
        uniqueInboundCallers: uniqueInbound,
        byDay: Object.values(byDay).sort((a, b) => b.date.localeCompare(a.date)),
        byRep: Object.values(byRep).sort((a, b) => b.total - a.total),
        byClassification: {
          new_prospect: 0,
          existing_lead: 0,
          existing_deal: 0,
          existing_customer: 0,
          unknown: total,
        },
      },
      source: 'supabase',
    };

    await setCached(cacheKey, result, CACHE_TTL);
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    res.json(result);
  } catch (err) {
    console.error('[v2/sales-calls]', err.message);
    res.status(500).json({ error: err.message });
  }
}
