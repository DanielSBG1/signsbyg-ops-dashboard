import supabase from '../_lib/supabase.js';
import { getDateRange } from '../_lib/sales/periods.js';
import { classifySource } from '../_lib/sales/constants.js';
import { getCached, setCached } from '../_lib/cache.js';

const INTERNAL_DOMAINS = ['signsbyghouston.com', 'signsbyghouston.net'];
const MANUAL_SOURCES = ['EXTENSION', 'CRM_UI', 'API'];

function classifyContactStatus(c) {
  const email = (c.properties?.email || '').toLowerCase();
  const domain = email.split('@')[1] || '';
  const numDeals = parseInt(c.properties?.num_associated_deals) || 0;
  const lifecycle = (c.properties?.lifecyclestage || '').toLowerCase();
  const sourceDetail = (c.properties?.hs_analytics_source_data_1 || '').toUpperCase();
  const sourceRaw = (c.properties?.hs_analytics_source || '').toUpperCase();
  const isManualEntry = MANUAL_SOURCES.includes(sourceDetail) || MANUAL_SOURCES.includes(sourceRaw);

  if (INTERNAL_DOMAINS.includes(domain)) return 'internal';
  if (lifecycle === 'customer' || lifecycle === 'opportunity' || numDeals > 0) return 'qualified';
  if (isManualEntry && numDeals === 0) return 'manual_entry';
  if (lifecycle === 'lead' || lifecycle === 'marketingqualifiedlead' || lifecycle === 'salesqualifiedlead') return 'new_lead';
  return 'unqualified';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { repId, period = 'month', start: customStart, end: customEnd } = req.query;
  if (!repId) return res.status(400).json({ error: 'repId is required', leads: [] });

  try {
    const range = getDateRange(period, customStart, customEnd);
    const cacheKey = `sales-rep-leads:v2:${repId}:${period}:${customStart || ''}:${customEnd || ''}`;
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

    const hit = await getCached(cacheKey);
    if (hit) {
      console.log(`[v2/sales-rep-leads HIT] ${cacheKey}`);
      return res.status(200).json(hit);
    }
    console.log(`[v2/sales-rep-leads MISS] ${cacheKey}`);

    // Query contacts and owners in parallel
    const [contactsResult, ownersResult] = await Promise.all([
      supabase
        .from('hubspot_contacts')
        .select('id, properties')
        .eq('properties->>hubspot_owner_id', repId)
        .gte('properties->>createdate', range.start)
        .lte('properties->>createdate', range.end),
      supabase
        .from('hubspot_owners')
        .select('id, first_name, last_name, email'),
    ]);

    if (contactsResult.error) throw new Error(`Supabase contacts query failed: ${contactsResult.error.message}`);
    if (ownersResult.error) throw new Error(`Supabase owners query failed: ${ownersResult.error.message}`);

    const contacts = contactsResult.data || [];
    const owners = ownersResult.data || [];

    const ownerMap = {};
    for (const o of owners) {
      ownerMap[o.id] = `${o.first_name || ''} ${o.last_name || ''}`.trim() || o.email;
    }

    const rangeStartMs = Date.parse(range.start);
    const portalId = process.env.HUBSPOT_PORTAL_ID || '';

    const leads = contacts.map((c) => {
      const props = c.properties || {};
      const status = classifyContactStatus(c);
      const createdMs = Date.parse(props.createdate || '');
      const isReoptIn = !!(createdMs && createdMs < rangeStartMs);

      return {
        id: c.id,
        name: `${props.firstname || ''} ${props.lastname || ''}`.trim() || props.email || 'Unknown',
        email: props.email || '',
        source: classifySource(props.hs_analytics_source, props.hs_analytics_source_data_1),
        sourceRaw: props.hs_analytics_source || '',
        sourceDetail: props.hs_analytics_source_data_1 || '',
        rep: ownerMap[props.hubspot_owner_id] || 'Unassigned',
        repId: props.hubspot_owner_id || '',
        createdAt: props.createdate || '',
        recentConversionAt: props.recent_conversion_date || '',
        numConversionEvents: parseInt(props.num_conversion_events) || 0,
        isReoptIn,
        lifecycleStage: props.lifecyclestage || '',
        numDeals: parseInt(props.num_associated_deals) || 0,
        status,
        hubspotUrl: portalId ? `https://app.hubspot.com/contacts/${portalId}/contact/${c.id}` : '',
      };
    });

    const payload = { leads, generatedAt: new Date().toISOString() };
    await setCached(cacheKey, payload, 120);
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[v2/sales-rep-leads]', err);
    return res.status(500).json({ error: err.message, leads: [] });
  }
}
