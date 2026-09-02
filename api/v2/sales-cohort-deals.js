import supabase from '../_lib/supabase.js';
import { getDateRange } from '../_lib/sales/periods.js';
import {
  PIPELINES, PIPELINE_STAGES, CLOSED_WON_STAGES, CLOSED_LOST_STAGES,
  classifySource, mapDealLeadSource,
} from '../_lib/sales/constants.js';
import { getCached, setCached } from '../_lib/cache.js';

// Build lookup tables once at module load
const stageLabelByPipelineId = {};
const pipelineLabelById = {};

for (const [pKey, stages] of Object.entries(PIPELINE_STAGES)) {
  const pId = PIPELINES[pKey].id;
  stageLabelByPipelineId[pId] = {};
  for (const s of stages) stageLabelByPipelineId[pId][s.id] = s.label;
}
for (const [, { id, label }] of Object.entries(PIPELINES)) pipelineLabelById[id] = label;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { period = 'month', start: customStart, end: customEnd } = req.query;
    const range = getDateRange(period, customStart, customEnd);
    const periodDays = (Date.parse(range.end) - Date.parse(range.start)) / 86400000;

    // Narrow periods already get cohortDeals from /api/sales-metrics — skip
    if (periodDays <= 14) {
      return res.status(200).json({ cohortDeals: [], generatedAt: new Date().toISOString(), skipped: true });
    }

    const cacheKey = `sales-cohortv2:${period}:${customStart || ''}:${customEnd || ''}`;
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

    const hit = await getCached(cacheKey);
    if (hit) {
      console.log(`[v2/sales-cohort-deals HIT] ${cacheKey}`);
      return res.status(200).json(hit);
    }
    console.log(`[v2/sales-cohort-deals MISS] ${cacheKey}`);

    // 1. Fetch contacts created in the period
    const { data: contacts, error: contactsErr } = await supabase
      .from('hubspot_contacts')
      .select('id, properties')
      .gte('created_at', range.start)
      .lt('created_at', range.end);

    if (contactsErr) throw new Error(`contacts query failed: ${contactsErr.message}`);

    if (!contacts || contacts.length === 0) {
      const payload = { cohortDeals: [], generatedAt: new Date().toISOString() };
      const ttlSeconds = periodDays > 30 ? 1800 : 300;
      await setCached(cacheKey, payload, ttlSeconds);
      return res.status(200).json(payload);
    }

    // Build a Set of period contact IDs for cross-reference
    const periodContactIds = new Set(contacts.map((c) => String(c.id)));

    // 2. Fetch owners
    const { data: ownerRows } = await supabase
      .from('hubspot_owners')
      .select('id, first_name, last_name');

    const ownerMap = {};
    for (const o of ownerRows || []) {
      ownerMap[String(o.id)] = `${o.first_name || ''} ${o.last_name || ''}`.trim() || String(o.id);
    }

    // 3. Fetch all deals that have at least one association to a contact in the period.
    //    The associations column is JSONB shaped as: { contacts: [{ id, type }, ...] }
    //    We use a Postgres containment query to narrow down candidates, then filter
    //    in JS because PostgREST doesn't expose a cross-row array-element filter
    //    directly on nested JSONB arrays without a custom RPC.
    //    For large datasets consider an RPC; for this scale JS filtering is fine.
    const { data: allDeals, error: dealsErr } = await supabase
      .from('hubspot_deals')
      .select('id, properties, associations')
      .not('associations', 'is', null);

    if (dealsErr) throw new Error(`deals query failed: ${dealsErr.message}`);

    // 4. Build the assoc map: contactId -> Set<dealId>, and keep deal records
    //    Only include deals that link to at least one period contact.
    const assocMap = new Map(); // contactId (string) -> Set of dealIds
    const dealRecordById = new Map();

    for (const deal of allDeals || []) {
      const dealId = String(deal.id);
      const contactLinks = deal.associations?.contacts;
      if (!Array.isArray(contactLinks) || contactLinks.length === 0) continue;

      let linkedToPeriodContact = false;
      for (const link of contactLinks) {
        const cid = String(link.id);
        if (!periodContactIds.has(cid)) continue;
        linkedToPeriodContact = true;
        if (!assocMap.has(cid)) assocMap.set(cid, new Set());
        assocMap.get(cid).add(dealId);
      }

      if (linkedToPeriodContact) {
        dealRecordById.set(dealId, deal);
      }
    }

    if (assocMap.size === 0) {
      const payload = { cohortDeals: [], generatedAt: new Date().toISOString() };
      const ttlSeconds = periodDays > 30 ? 1800 : 300;
      await setCached(cacheKey, payload, ttlSeconds);
      return res.status(200).json(payload);
    }

    // 5. Determine source override from deal lead_source (prefer most recently created deal)
    const dealLeadSource = new Map(); // dealId -> { source, createdate }
    for (const [dealId, deal] of dealRecordById) {
      const mapped = mapDealLeadSource(deal.properties?.lead_source);
      if (mapped) {
        dealLeadSource.set(dealId, {
          source: mapped,
          createdate: deal.properties?.createdate || '',
        });
      }
    }

    const contactSourceOverride = new Map(); // contactId -> source key
    for (const [contactId, dealIds] of assocMap) {
      let best = null;
      for (const did of dealIds) {
        const entry = dealLeadSource.get(did);
        if (!entry) continue;
        if (!best || entry.createdate > best.createdate) best = entry;
      }
      if (best) contactSourceOverride.set(contactId, best.source);
    }

    // 6. Build contact lookup for source/rep enrichment
    const contactById = new Map();
    for (const c of contacts) contactById.set(String(c.id), c);

    function effectiveSource(contact) {
      const cid = String(contact.id);
      return (
        contactSourceOverride.get(cid) ||
        classifySource(
          contact.properties?.hs_analytics_source,
          contact.properties?.hs_analytics_source_data_1
        )
      );
    }

    // 7. Assemble cohortDeals
    const cohortDeals = [];

    for (const [contactId, dealIds] of assocMap) {
      const contact = contactById.get(contactId);
      if (!contact) continue;

      const contactSource = effectiveSource(contact);
      const contactRepId = contact.properties?.hubspot_owner_id || '';

      for (const did of dealIds) {
        const deal = dealRecordById.get(did);
        if (!deal) continue;

        const props = deal.properties || {};
        const stageLabel = stageLabelByPipelineId[props.pipeline]?.[props.dealstage] || props.dealstage || '';
        const isWon = CLOSED_WON_STAGES.includes(props.dealstage);
        const isLost = CLOSED_LOST_STAGES.includes(props.dealstage);

        cohortDeals.push({
          id: did,
          name: props.dealname || 'Untitled',
          stage: props.dealstage || '',
          stageLabel,
          pipeline: props.pipeline || '',
          pipelineLabel: pipelineLabelById[props.pipeline] || '',
          amount: parseFloat(props.amount) || 0,
          ownerId: props.hubspot_owner_id || '',
          ownerName: ownerMap[props.hubspot_owner_id] || 'Unassigned',
          createdate: props.createdate || '',
          closedate: props.closedate || '',
          status: isWon ? 'won' : isLost ? 'lost' : 'open',
          contactId,
          contactSource,
          contactRepId,
          hubspotUrl: process.env.HUBSPOT_PORTAL_ID
            ? `https://app.hubspot.com/contacts/${process.env.HUBSPOT_PORTAL_ID}/deal/${did}`
            : '',
        });
      }
    }

    const ttlSeconds = periodDays > 30 ? 1800 : 300;
    const payload = { cohortDeals, generatedAt: new Date().toISOString() };
    await setCached(cacheKey, payload, ttlSeconds);

    return res.status(200).json(payload);
  } catch (err) {
    console.error('[v2/sales-cohort-deals]', err);
    return res.status(500).json({ error: err.message, cohortDeals: [] });
  }
}
