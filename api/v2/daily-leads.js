/**
 * v2/daily-leads — Lead intake + conversion module.
 *
 * Shows total leads by source (HubSpot + AI-classified phone calls)
 * and how many of those leads converted into deals.
 *
 * "Converted" = a deal exists whose associated contact was created in this period.
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
    const dayEnd = range.end;

    const cacheKey = `daily-leads:v3:${period}:${customStart || ''}:${customEnd || ''}`;
    const cached = await getCached(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      return res.json(cached);
    }

    // ── 3 parallel Supabase queries ──
    const [contactsRes, callsRes, dealsRes] = await Promise.all([
      // 1. HubSpot contacts created in period
      supabase
        .from('hubspot_contacts')
        .select('id, properties')
        .gte('properties->>createdate', dayStart)
        .lte('properties->>createdate', dayEnd),

      // 2. Inbound calls classified as new_lead in period
      supabase
        .from('openphone_calls')
        .select('id, participant_phone, user_name, duration, ai_classification, ai_summary, created_at, transcript')
        .eq('direction', 'incoming')
        .eq('ai_classification', 'new_lead')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd),

      // 3. ALL deals with associations (to find which reference period contacts)
      supabase
        .from('hubspot_deals')
        .select('id, properties, associations')
        .not('associations', 'is', null),
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
        numDeals: parseInt(p.num_associated_deals) || 0,
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

    // ── Deduplicate: remove call leads whose phone matches a HubSpot contact ──
    const contactPhones = new Set();
    for (const c of contacts) {
      if (c.phone) contactPhones.add(c.phone.replace(/[^0-9+]/g, ''));
    }
    const uniqueCallLeads = callLeads.filter(c => {
      const normalized = (c.phone || '').replace(/[^0-9+]/g, '');
      return !contactPhones.has(normalized);
    });

    // ── Find deals converted FROM these period leads ──
    // A deal is "converted" if its associations.contacts includes a contact created in this period
    const periodContactIds = new Set(contacts.map(c => c.id));
    const convertedDeals = [];
    for (const d of dealsRes.data || []) {
      const assocContacts = d.associations?.contacts || [];
      const matchedContact = assocContacts.find(a => periodContactIds.has(String(a.id)));
      if (matchedContact) {
        const p = d.properties || {};
        convertedDeals.push({
          id: d.id,
          name: p.dealname || 'Unnamed Deal',
          amount: parseFloat(p.amount) || 0,
          stage: p.dealstage || null,
          pipeline: p.pipeline || null,
          owner: p.hubspot_owner_id || null,
          createdAt: p.createdate || null,
          contactId: String(matchedContact.id),
        });
      }
    }
    const convertedRevenue = convertedDeals.reduce((s, d) => s + d.amount, 0);

    // ── Classify contacts by source ──
    const sourceBreakdown = {};
    for (const c of contacts) {
      const src = classifySource(c.source, c.sourceDetail);
      sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;
    }

    // Count Facebook/Meta leads specifically
    const fbLeads = contacts.filter(c => {
      const src = classifySource(c.source, c.sourceDetail);
      return src === 'Facebook';
    }).length;

    const totalHubSpotLeads = contacts.length;
    const totalCallLeads = uniqueCallLeads.length;
    const totalLeads = totalHubSpotLeads + totalCallLeads;
    const conversionRate = totalLeads > 0 ? Math.round((convertedDeals.length / totalLeads) * 100) : 0;

    const result = {
      ok: true,
      data: {
        period: { start: range.start, end: range.end, label: range.label },
        generatedAt: new Date().toISOString(),

        // Summary
        totalLeads,
        hubspotLeads: totalHubSpotLeads,
        callLeads: totalCallLeads,
        fbLeads,
        dealsConverted: convertedDeals.length,
        convertedRevenue,
        conversionRate,

        // Breakdowns
        sourceBreakdown,

        // Detail lists
        contacts,
        callLeads: uniqueCallLeads,
        deals: convertedDeals,
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
