import { getContactsForRepInRange, getOwners } from './_lib/sales/hubspot.js';
import { getDateRange } from './_lib/sales/periods.js';
import { classifySource } from './_lib/sales/constants.js';
import { getCached, setCached } from './_lib/cache.js';

const INTERNAL_DOMAINS = ['signsbyghouston.com', 'signsbyghouston.net'];
const MANUAL_SOURCES = ['EXTENSION', 'CRM_UI', 'API'];

function classifyLead(c) {
  const email = (c.properties.email || '').toLowerCase();
  const domain = email.split('@')[1] || '';
  const numDeals = parseInt(c.properties.num_associated_deals) || 0;
  const lifecycle = (c.properties.lifecyclestage || '').toLowerCase();
  const sourceDetail = (c.properties.hs_analytics_source_data_1 || '').toUpperCase();
  const sourceRaw = (c.properties.hs_analytics_source || '').toUpperCase();
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
    const cacheKey = `sales-rep-leads:v1:${repId}:${period}:${customStart || ''}:${customEnd || ''}`;
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

    const hit = await getCached(cacheKey);
    if (hit) {
      console.log(`[sales-rep-leads HIT] ${cacheKey}`);
      return res.status(200).json(hit);
    }
    console.log(`[sales-rep-leads MISS] ${cacheKey}`);

    const [contactsResult, owners] = await Promise.all([
      getContactsForRepInRange(repId, range.start, range.end),
      getOwners().catch(() => []),
    ]);

    const ownerMap = {};
    for (const o of owners) {
      ownerMap[o.id] = `${o.firstName || ''} ${o.lastName || ''}`.trim() || o.email;
    }

    const rangeStartMs = Date.parse(range.start);
    const portalId = process.env.HUBSPOT_PORTAL_ID || '';

    const leads = contactsResult.results.map((c) => {
      const status = classifyLead(c);
      const createdMs = Date.parse(c.properties.createdate || '');
      const isReoptIn = createdMs && createdMs < rangeStartMs;
      return {
        id: c.id,
        name: `${c.properties.firstname || ''} ${c.properties.lastname || ''}`.trim() || c.properties.email || 'Unknown',
        email: c.properties.email || '',
        source: classifySource(c.properties.hs_analytics_source, c.properties.hs_analytics_source_data_1),
        sourceRaw: c.properties.hs_analytics_source || '',
        sourceDetail: c.properties.hs_analytics_source_data_1 || '',
        rep: ownerMap[c.properties.hubspot_owner_id] || 'Unassigned',
        repId: c.properties.hubspot_owner_id || '',
        createdAt: c.properties.createdate || '',
        recentConversionAt: c.properties.recent_conversion_date || '',
        numConversionEvents: parseInt(c.properties.num_conversion_events) || 0,
        isReoptIn: !!(isReoptIn),
        lifecycleStage: c.properties.lifecyclestage || '',
        numDeals: parseInt(c.properties.num_associated_deals) || 0,
        status,
        hubspotUrl: portalId ? `https://app.hubspot.com/contacts/${portalId}/contact/${c.id}` : '',
      };
    });

    const payload = { leads, generatedAt: new Date().toISOString() };
    await setCached(cacheKey, payload, 120);
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[sales-rep-leads]', err);
    return res.status(500).json({ error: err.message, leads: [] });
  }
}
