import { getContactsInRange, getContactDealAssociationsBatch, getDealsByIds, getOwners } from './_lib/sales/hubspot.js';
import { getDateRange } from './_lib/sales/periods.js';
import {
  PIPELINES, PIPELINE_STAGES, CLOSED_WON_STAGES, CLOSED_LOST_STAGES,
  classifySource, mapDealLeadSource,
} from './_lib/sales/constants.js';
import { getCached, setCached } from './_lib/cache.js';

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

    const cacheKey = `sales-cohortv1:${period}:${customStart || ''}:${customEnd || ''}`;
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

    const hit = await getCached(cacheKey);
    if (hit) {
      console.log(`[sales-cohort-deals HIT] ${cacheKey}`);
      return res.status(200).json(hit);
    }
    console.log(`[sales-cohort-deals MISS] ${cacheKey}`);

    const [contactsResult, owners] = await Promise.all([
      getContactsInRange(range.start, range.end),
      getOwners().catch(() => []),
    ]);

    const ownerMap = {};
    for (const o of owners) {
      ownerMap[o.id] = `${o.firstName || ''} ${o.lastName || ''}`.trim() || o.email;
    }

    const contactsWithDeals = contactsResult.results.filter(
      (c) => (parseInt(c.properties.num_associated_deals) || 0) > 0
    );

    let cohortDeals = [];

    if (contactsWithDeals.length > 0) {
      const contactIds = contactsWithDeals.map((c) => c.id);
      const assocMap = await getContactDealAssociationsBatch(contactIds);

      const allDealIds = new Set();
      for (const ids of assocMap.values()) for (const id of ids) allDealIds.add(id);

      const dealRecords = await getDealsByIds(
        [...allDealIds],
        ['lead_source', 'createdate', 'dealname', 'dealstage', 'pipeline', 'amount', 'hubspot_owner_id', 'closedate']
      );

      const dealLeadSource = new Map();
      const dealRecordById = new Map();
      for (const d of dealRecords) {
        const mapped = mapDealLeadSource(d.properties?.lead_source);
        if (mapped) dealLeadSource.set(d.id, { source: mapped, createdate: d.properties?.createdate || '' });
        dealRecordById.set(d.id, d);
      }

      const contactSourceOverride = new Map();
      for (const [contactId, dealIds] of assocMap.entries()) {
        let best = null;
        for (const did of dealIds) {
          const entry = dealLeadSource.get(did);
          if (!entry) continue;
          if (!best || entry.createdate > best.createdate) best = entry;
        }
        if (best) contactSourceOverride.set(contactId, best.source);
      }

      function effectiveSource(contact) {
        return (
          contactSourceOverride.get(contact.id) ||
          classifySource(contact.properties.hs_analytics_source, contact.properties.hs_analytics_source_data_1)
        );
      }

      const stageLabelByPipelineId = {};
      const pipelineLabelById = {};
      for (const [pKey, stages] of Object.entries(PIPELINE_STAGES)) {
        const pId = PIPELINES[pKey].id;
        stageLabelByPipelineId[pId] = {};
        for (const s of stages) stageLabelByPipelineId[pId][s.id] = s.label;
      }
      for (const [, { id, label }] of Object.entries(PIPELINES)) pipelineLabelById[id] = label;

      const contactById = new Map();
      for (const c of contactsResult.results) contactById.set(c.id, c);

      for (const [contactId, dealIds] of assocMap.entries()) {
        const contact = contactById.get(contactId);
        if (!contact) continue;
        const contactSource = effectiveSource(contact);
        const contactRepId = contact.properties.hubspot_owner_id || '';

        for (const did of dealIds) {
          const d = dealRecordById.get(did);
          if (!d) continue;
          const props = d.properties || {};
          const stageLabel = stageLabelByPipelineId[props.pipeline]?.[props.dealstage] || props.dealstage || '';
          const isWon = CLOSED_WON_STAGES.includes(props.dealstage);
          const isLost = CLOSED_LOST_STAGES.includes(props.dealstage);
          cohortDeals.push({
            id: d.id,
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
              ? `https://app.hubspot.com/contacts/${process.env.HUBSPOT_PORTAL_ID}/deal/${d.id}`
              : '',
          });
        }
      }
    }

    const ttlSeconds = periodDays > 30 ? 1800 : 300;
    const payload = { cohortDeals, generatedAt: new Date().toISOString() };
    await setCached(cacheKey, payload, ttlSeconds);

    return res.status(200).json(payload);
  } catch (err) {
    console.error('[sales-cohort-deals]', err);
    return res.status(500).json({ error: err.message, cohortDeals: [] });
  }
}
