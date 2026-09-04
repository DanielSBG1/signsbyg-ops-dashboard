/**
 * v2/daily-leads — Daily lead intake module.
 *
 * Combines:
 * 1. HubSpot contacts created today (from Supabase)
 * 2. Classified OpenPhone calls (new_lead calls from Supabase)
 * 3. Same-day deal conversions
 *
 * Response time: <200ms (all from Supabase)
 */
import supabase from '../_lib/supabase.js';
import { getDateRange } from '../_lib/sales/periods.js';
import { getCached, setCached } from '../_lib/cache.js';

const CACHE_TTL = 60;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { period = 'today', start: customStart, end: customEnd } = req.query;
    const range = getDateRange(period, customStart, customEnd);
    const dayStart = range.start;
    const dayEnd = range.end + 'T23:59:59.999Z';

    const cacheKey = `daily-leads:v2:${period}:${customStart || ''}:${customEnd || ''}`;
    const cached = await getCached(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      return res.json(cached);
    }

    // ── 3 parallel Supabase queries ──
    const [contactsRes, callsRes, dealsRes] = await Promise.all([
      // 1. HubSpot contacts created today
      supabase
        .from('hubspot_contacts')
        .select('id, properties')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd),

      // 2. Inbound calls classified as new_lead today
      supabase
        .from('openphone_calls')
        .select('id, participant_phone, user_name, duration, ai_classification, ai_summary, created_at, transcript')
        .eq('direction', 'incoming')
        .eq('ai_classification', 'new_lead')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd),

      // 3. Deals created today (same-day conversions)
      supabase
        .from('hubspot_deals')
        .select('id, properties')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd),
    ]);

    // ── Process contacts ──
    const contacts = (contactsRes.data || []).map(c => {
      const p = c.properties || {};
      return {
        id: c.id,
        name: [p.firstname, p.lastname].filter(Boolean).join(' ') || p.email || 'Unknown',
        email: p.email || null,
        phone: p.phone || p.mobilephone || null,
        source: p.hs_analytics_source || 'unknown',
        sourceDetail: p.hs_analytics_source_data_1 || null,
        lifecycleStage: p.lifecyclestage || null,
        owner: p.hubspot_owner_id || null,
        createdAt: p.createdate || null,
      };
    });

    // ── Process call leads ──
    const callLeads = (callsRes.data || []).map(c => ({
      id: c.id,
      phone: c.participant_phone,
      rep: c.user_name,
      duration: c.duration,
      summary: c.ai_summary,
      classification: c.ai_classification,
      createdAt: c.created_at,
      hasTranscript: Boolean(c.transcript),
    }));

    // ── Process deals ──
    const deals = (dealsRes.data || []).map(d => {
      const p = d.properties || {};
      return {
        id: d.id,
        name: p.dealname || 'Unnamed Deal',
        amount: parseFloat(p.amount) || 0,
        stage: p.dealstage || null,
        pipeline: p.pipeline || null,
        owner: p.hubspot_owner_id || null,
        createdAt: p.createdate || null,
      };
    });

    // ── Deduplicate: remove call leads whose phone matches a HubSpot contact ──
    const contactPhones = new Set();
    for (const c of contacts) {
      if (c.phone) contactPhones.add(c.phone.replace(/[^0-9+]/g, ''));
    }
    const uniqueCallLeads = callLeads.filter(c => {
      const normalized = (c.phone || '').replace(/[^0-9+]/g, '');
      return !contactPhones.has(normalized);
    });

    // ── Classify contacts by source ──
    const sourceBreakdown = {};
    for (const c of contacts) {
      const src = classifySource(c.source, c.sourceDetail);
      sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;
    }

    const totalHubSpotLeads = contacts.length;
    const totalCallLeads = uniqueCallLeads.length;
    const totalLeads = totalHubSpotLeads + totalCallLeads;
    const totalDeals = deals.length;
    const conversionRate = totalLeads > 0 ? Math.round((totalDeals / totalLeads) * 100) : 0;

    const result = {
      ok: true,
      data: {
        period: { start: range.start, end: range.end, label: range.label },
        generatedAt: new Date().toISOString(),

        // Summary
        totalLeads,
        hubspotLeads: totalHubSpotLeads,
        callLeads: totalCallLeads,
        sameDayDeals: totalDeals,
        conversionRate,

        // Breakdowns
        sourceBreakdown,
        byHour: buildHourlyBreakdown(contacts, uniqueCallLeads),

        // Detail lists
        contacts,
        callLeads: uniqueCallLeads,
        deals,

        // Call classification stats (all calls today, not just new_lead)
        callClassificationPending: 0, // will be filled if we query for unclassified
      },
    };

    await setCached(cacheKey, result, CACHE_TTL);
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.json(result);
  } catch (err) {
    console.error('[v2/daily-leads]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ── Helpers ──

function classifySource(source, detail) {
  const s = (source || '').toLowerCase();
  const d = (detail || '').toLowerCase();
  if (s.includes('paid_social') || d.includes('facebook') || d.includes('fb')) return 'Facebook';
  if (s.includes('organic') || s.includes('organic_search')) return 'Organic';
  if (s.includes('direct') || s === 'direct_traffic') return 'Direct / Website';
  if (s.includes('referral')) return 'Referral';
  if (s.includes('email')) return 'Email';
  if (s === 'offline' && d.includes('crm_ui')) return 'Manual Entry';
  if (s === 'offline') return 'Phone Call';
  return source || 'Unknown';
}

function buildHourlyBreakdown(contacts, callLeads) {
  const hours = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: `${i === 0 ? 12 : i > 12 ? i - 12 : i}${i < 12 ? 'am' : 'pm'}`,
    hubspot: 0,
    calls: 0,
    total: 0,
  }));

  for (const c of contacts) {
    if (c.createdAt) {
      const h = new Date(c.createdAt).getHours();
      hours[h].hubspot++;
      hours[h].total++;
    }
  }
  for (const c of callLeads) {
    if (c.createdAt) {
      const h = new Date(c.createdAt).getHours();
      hours[h].calls++;
      hours[h].total++;
    }
  }

  return hours;
}