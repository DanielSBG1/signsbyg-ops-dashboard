/**
 * v2/sales-handoffs — reads from Supabase hubspot_deals table.
 *
 * Replaces the v1 endpoint that reads from HubSpot API + engagements.
 * Notes (deal engagements) are NOT synced to Supabase, so contract_url
 * and drawing_url checks from v1 are omitted. Completeness is scored
 * out of 5 fields instead of 7.
 *
 * Checked fields:
 *   pm_name, sbg_scope_of_work, contact (associated), amount, street_address
 *
 * Query params:
 *   period  — 'today' (default) | 'yesterday' | 'week' | 'lastweek' |
 *             'month' | 'lastmonth' | 'quarter' | 'q1'–'q4' | 'year' | 'custom'
 *   start   — ISO date string (required when period=custom)
 *   end     — ISO date string (required when period=custom)
 */
import supabase from '../_lib/supabase.js';
import { getDateRange } from '../_lib/sales/periods.js';
import { CLOSED_WON_STAGES } from '../_lib/sales/constants.js';
import { getCached, setCached } from '../_lib/cache.js';

const CACHE_TTL = 120;
const TOTAL_FIELDS = 5;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { period = 'today', start: customStart, end: customEnd } = req.query;

    if (period === 'custom' && (!customStart || !customEnd)) {
      return res.status(400).json({ error: 'Custom period requires start and end query params' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

    const cacheKey = `handoffsv2:${period}:${customStart || ''}:${customEnd || ''}`;
    const hit = await getCached(cacheKey);
    if (hit) { console.log(`[Cache HIT] ${cacheKey}`); return res.status(200).json(hit); }
    console.log(`[Cache MISS] ${cacheKey}`);

    const range = getDateRange(period, customStart, customEnd);

    // Fetch closed-won deals in the date range and owners in parallel.
    // closedate is stored as a date string (YYYY-MM-DD) in the JSONB properties.
    const [dealsRes, ownersRes] = await Promise.all([
      supabase
        .from('hubspot_deals')
        .select('id, properties, associations')
        .in('properties->>dealstage', CLOSED_WON_STAGES)
        .gte('properties->>closedate', range.start.split('T')[0])
        .lte('properties->>closedate', range.end.split('T')[0]),
      supabase
        .from('hubspot_owners')
        .select('id, first_name, last_name'),
    ]);

    if (dealsRes.error) throw new Error(`Supabase deals error: ${dealsRes.error.message}`);
    if (ownersRes.error) throw new Error(`Supabase owners error: ${ownersRes.error.message}`);

    // Build owner lookup map
    const ownerMap = {};
    for (const o of (ownersRes.data || [])) {
      ownerMap[String(o.id)] = `${o.first_name || ''} ${o.last_name || ''}`.trim() || `Owner ${o.id}`;
    }

    const deals = (dealsRes.data || []).map((row) => {
      const p = row.properties || {};

      // contacts association: associations.contacts is an array of contact IDs
      const contacts = row.associations?.contacts;
      const hasContact = Array.isArray(contacts) && contacts.length > 0;

      const fields = {
        pm_name: !!p.pm_name && String(p.pm_name).trim() !== '',
        sbg_scope_of_work: !!p.sbg_scope_of_work && String(p.sbg_scope_of_work).trim() !== '',
        contact: hasContact,
        amount: !!p.amount && parseFloat(p.amount) > 0,
        street_address: !!p.street_address && String(p.street_address).trim() !== '',
      };

      const completeness = Object.values(fields).filter(Boolean).length;
      const ownerId = String(p.hubspot_owner_id || '');

      return {
        id: String(row.id),
        name: p.dealname || 'Unnamed Deal',
        rep: ownerMap[ownerId] || (ownerId ? `Owner ${ownerId}` : 'Unknown'),
        repId: ownerId,
        closeDate: p.closedate ? String(p.closedate).split('T')[0] : '',
        fields,
        completeness,
      };
    });

    // Overall summary
    const totalDeals = deals.length;
    const totalCompleteness = deals.reduce((sum, d) => sum + d.completeness, 0);
    const avgCompleteness = totalDeals > 0
      ? Math.round((totalCompleteness / (totalDeals * TOTAL_FIELDS)) * 100)
      : 0;
    const fullyComplete = deals.filter((d) => d.completeness === TOTAL_FIELDS).length;
    const incomplete = totalDeals - fullyComplete;

    // Aggregate by rep
    const repMap = {};
    for (const deal of deals) {
      if (!repMap[deal.repId]) {
        repMap[deal.repId] = {
          id: deal.repId,
          name: deal.rep,
          deals: 0,
          totalCompleteness: 0,
          incompleteDeals: 0,
        };
      }
      repMap[deal.repId].deals += 1;
      repMap[deal.repId].totalCompleteness += deal.completeness;
      if (deal.completeness < TOTAL_FIELDS) repMap[deal.repId].incompleteDeals += 1;
    }

    const reps = Object.values(repMap).map((r) => ({
      ...r,
      avgCompleteness: Math.round((r.totalCompleteness / (r.deals * TOTAL_FIELDS)) * 100),
    }));
    reps.sort((a, b) => a.avgCompleteness - b.avgCompleteness);

    const result = {
      period: { start: range.start, end: range.end, label: range.label },
      summary: { totalDeals, avgCompleteness, fullyComplete, incomplete },
      reps,
      deals,
    };

    await setCached(cacheKey, result, CACHE_TTL);
    return res.status(200).json(result);
  } catch (err) {
    console.error('v2/sales-handoffs error:', err);
    return res.status(500).json({ error: err.message });
  }
}
