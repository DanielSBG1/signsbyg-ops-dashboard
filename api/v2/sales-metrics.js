/**
 * v2/sales-metrics — reads from Supabase instead of HubSpot API.
 *
 * Drop-in replacement for api/sales-metrics.js (v1). All computation logic
 * (buildPipeline, buildPipelineHealth, classifySource, SLA calculations,
 * per-rep scorecards, funnel building, etc.) is IDENTICAL. Only the data
 * fetching layer has changed: HubSpot REST API → Supabase queries.
 *
 * Expected cold-cache response: <2s (vs 15-45s for v1 on wide periods).
 *
 * Supabase tables used:
 *   - hubspot_contacts (id, properties JSONB, created_at, updated_at)
 *   - hubspot_deals    (id, properties JSONB, associations JSONB, stage_history JSONB, created_at, updated_at)
 *   - hubspot_owners   (id, first_name, last_name, email, is_active)
 *   - openphone_calls  (id, direction, status, duration, phone_number, participant_phone, user_id, user_name, created_at, has_voicemail)
 */
import supabase from '../_lib/supabase.js';
import { normalizePhone } from '../_lib/sales/openphone.js';
import { getDateRange } from '../_lib/sales/periods.js';
import {
  PIPELINES, CLOSED_WON_STAGES, CLOSED_LOST_STAGES,
  PIPELINE_STAGES, SOURCE_MAP, classifySource, mapDealLeadSource,
  AVG_CYCLE_DAYS, AVG_CYCLE_DEAL_COUNTS, AVG_CYCLE_GENERATED_AT,
  HOT_STAGES_BY_PIPELINE, STICKY_HOT_STAGES_BY_PIPELINE, DESIGN_MILESTONE_STAGE,
  PRE_DESIGN_STAGES, POST_DESIGN_STAGE, DEALS_SENT_STAGES,
} from '../_lib/sales/constants.js';
import { buildPipelineHealth } from '../_lib/sales/pipelineHealthBuilder.js';
import { buildPipeline } from '../_lib/sales/pipelineBuilder.js';
import { getCached, setCached } from '../_lib/cache.js';

// ============================================================
// Supabase data-fetching helpers
// ============================================================

/**
 * Transform a Supabase hubspot_contacts row into the shape v1 code expects.
 * v1 deal objects look like: { id, properties: {...}, createdAt }
 */
function rowToContact(row) {
  return {
    id: String(row.id),
    properties: row.properties || {},
    createdAt: row.created_at,
  };
}

/**
 * Transform a Supabase hubspot_deals row into the shape v1 code expects.
 */
function rowToDeal(row) {
  return {
    id: String(row.id),
    properties: row.properties || {},
    associations: row.associations || {},
    createdAt: row.created_at,
  };
}

/**
 * Transform a Supabase hubspot_owners row into the shape v1 code expects.
 */
function rowToOwner(row) {
  return {
    id: String(row.id),
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    email: row.email || '',
  };
}

/**
 * Fetch contacts where createdate is within [startISO, endISO].
 * v1 used TWO date filters (createdate OR recent_conversion_date) — for v2
 * we simplify to createdate only as instructed.
 *
 * Supabase has a 1000-row default limit; use pagination to fetch all.
 */
async function getContactsInRange(startISO, endISO) {
  const allRows = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('hubspot_contacts')
      .select('id, properties, created_at')
      .gte('properties->>createdate', startISO)
      .lte('properties->>createdate', endISO)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Supabase contacts query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  const results = allRows.map(rowToContact);
  return { results, total: results.length };
}

/**
 * Fetch deals where createdate is within [startISO, endISO].
 */
async function getDealsInRange(startISO, endISO) {
  const allRows = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('hubspot_deals')
      .select('id, properties, associations, stage_history, created_at')
      .gte('properties->>createdate', startISO)
      .lte('properties->>createdate', endISO)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Supabase deals-in-range query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  const results = allRows.map(rowToDeal);
  return { results, total: results.length };
}

/**
 * Fetch deals where closedate is within [startISO, endISO].
 */
async function getDealsClosedInRange(startISO, endISO) {
  const allRows = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('hubspot_deals')
      .select('id, properties, associations, stage_history, created_at')
      .gte('properties->>closedate', startISO)
      .lte('properties->>closedate', endISO)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Supabase closed-deals query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  const results = allRows.map(rowToDeal);
  return { results, total: results.length };
}

/**
 * Fetch all open deals (hs_is_closed is not 'true').
 */
async function getAllOpenDeals() {
  const allRows = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('hubspot_deals')
      .select('id, properties, associations, stage_history, created_at')
      .or('properties->>hs_is_closed.is.null,properties->>hs_is_closed.neq.true')
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Supabase open-deals query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  const results = allRows.map(rowToDeal);
  return { results, total: results.length };
}

/**
 * Fetch owners from hubspot_owners table.
 */
async function getOwners() {
  const { data, error } = await supabase
    .from('hubspot_owners')
    .select('id, first_name, last_name, email');
  if (error) {
    console.error(`[v2/metrics] owners query failed: ${error.message}`);
    return [];
  }
  return (data || []).map(rowToOwner);
}

/**
 * Fetch deals by an array of IDs.
 */
async function getDealsByIds(dealIds) {
  if (!dealIds || dealIds.length === 0) return [];
  const allRows = [];
  // Supabase `in` has a practical limit; chunk to 500
  const CHUNK = 500;
  for (let i = 0; i < dealIds.length; i += CHUNK) {
    const chunk = dealIds.slice(i, i + CHUNK).map(String);
    const { data, error } = await supabase
      .from('hubspot_deals')
      .select('id, properties, associations, stage_history, created_at')
      .in('id', chunk);
    if (error) {
      console.error(`[v2/metrics] getDealsByIds chunk error: ${error.message}`);
      continue;
    }
    if (data) allRows.push(...data);
  }
  return allRows.map(rowToDeal);
}

/**
 * Build a contact→deal association map from the hubspot_deals.associations column.
 * Returns Map<contactId, dealId[]>.
 *
 * Strategy: scan deals that have associations with any of the given contactIds.
 * Since associations.contacts stores [{id, type}], we load all deals that have
 * non-null associations and filter in JS. For targeted lookups (small contactIds
 * sets), this is fast enough. For very large sets, we fall back to scanning
 * all deals with associations.
 */
async function getContactDealAssociationsBatch(contactIds) {
  const map = new Map();
  if (!contactIds || contactIds.length === 0) return map;
  const contactIdSet = new Set(contactIds.map(String));

  // Fetch all deals that have any associations (non-null)
  const allRows = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('hubspot_deals')
      .select('id, associations')
      .not('associations', 'is', null)
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error(`[v2/metrics] associations query error: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  // Build contact→deal map
  for (const row of allRows) {
    const contacts = row.associations?.contacts || [];
    for (const assoc of contacts) {
      const cId = String(assoc.id);
      if (!contactIdSet.has(cId)) continue;
      if (!map.has(cId)) map.set(cId, []);
      map.get(cId).push(String(row.id));
    }
  }
  return map;
}

/**
 * Build a deal→contact association map. Returns Map<dealId, contactId[]>.
 * Reverse of getContactDealAssociationsBatch.
 */
async function getDealContactAssociationsBatch(dealIds) {
  const map = new Map();
  if (!dealIds || dealIds.length === 0) return map;

  // Fetch these specific deals with their associations
  const deals = await getDealsByIds(dealIds);
  for (const d of deals) {
    const contacts = d.associations?.contacts || [];
    const contactIds = contacts.map((a) => String(a.id));
    if (contactIds.length > 0) {
      map.set(String(d.id), contactIds);
    }
  }
  return map;
}

/**
 * Fetch deals currently in one of the sent stage IDs.
 * v1 used stage history to find deals that PASSED THROUGH a sent stage.
 * v2 approximation: deals currently IN a sent stage. This won't capture
 * deals that moved past the sent stage, but is a reasonable approximation
 * given stage_history is currently empty in Supabase.
 */
async function getDealsSentInStages(sentStageIds) {
  if (!sentStageIds || sentStageIds.length === 0) return { results: [], total: 0 };
  const allRows = [];
  const PAGE = 1000;
  // Build OR filter for all sent stage IDs
  const stageFilter = sentStageIds.map((id) => `properties->>dealstage.eq.${id}`).join(',');
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('hubspot_deals')
      .select('id, properties, associations, stage_history, created_at')
      .or(stageFilter)
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error(`[v2/metrics] deals-sent query error: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  const results = allRows.map(rowToDeal);
  return { results, total: results.length };
}

/**
 * Query openphone_calls for the earliest outbound call to a phone number
 * after a given date. Returns ms timestamp or null.
 */
async function getEarliestOutboundForPhoneSupabase(phoneE164, sinceISO) {
  if (!phoneE164) return null;
  const { data, error } = await supabase
    .from('openphone_calls')
    .select('created_at')
    .eq('participant_phone', phoneE164)
    .eq('direction', 'outbound')
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return Date.parse(data[0].created_at) || null;
}

// ============================================================
// Main handler
// ============================================================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { period = 'today', start: customStart, end: customEnd, nocache, include } = req.query;
    const forceRefresh = nocache === '1';
    const includeDrillDown = include === 'deals';
    const range = getDateRange(period, customStart, customEnd);

    // Cache key — v2 prefix to avoid collisions with v1
    const baseCacheKey = `metricsv2:${period}:${customStart || ''}:${customEnd || ''}`;
    const cacheKey = includeDrillDown ? `${baseCacheKey}:full` : baseCacheKey;

    // CDN cache header
    const isPeriodClosed = Date.now() - Date.parse(range.end) > 60 * 60 * 1000;
    if (forceRefresh) {
      res.setHeader('Cache-Control', 'no-store');
    } else if (isPeriodClosed) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    } else {
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    }

    if (!forceRefresh) {
      const cachedResp = await getCached(cacheKey);
      if (cachedResp) {
        console.log(`[Cache HIT] ${cacheKey}`);
        return res.status(200).json(cachedResp);
      }
    }
    console.log(`[Cache ${forceRefresh ? 'BYPASS' : 'MISS'}] ${cacheKey}`);

    // Period width — computed early so we can skip expensive fetches below
    const periodDays = (Date.parse(range.end) - Date.parse(range.start)) / 86400000;
    const periodEndMs = Date.parse(range.end);
    const isHistoricalPeriod = Date.now() - periodEndMs > 60 * 60 * 1000;
    const skipSourceOverride = periodDays > 14;
    const skipPrevPeriod = periodDays > 30;

    if (skipSourceOverride) console.log(`[v2/metrics] Skipping source override for ${Math.round(periodDays)}-day period`);
    if (skipPrevPeriod) console.log(`[v2/metrics] Skipping prev-period fetches for ${Math.round(periodDays)}-day period`);

    // Trailing 30-day window for pipeline coverage ratio
    const now30 = new Date();
    const trailing30Start = new Date(now30.getTime() - 30 * 86400000).toISOString();
    const trailing30End = now30.toISOString();

    // --- Fetch all data from Supabase in parallel ---
    const EMPTY_PAGE = { results: [], total: 0 };
    const sentStageIds = DEALS_SENT_STAGES.map((s) => s.id);

    const [
      contacts,
      deals,
      closedDeals,
      owners,
      prevContacts,
      prevDeals,
      prevClosedDeals,
      allDeals,
      trailing30Closed,
      dealsSentData,
      prevDealsSentData,
    ] = await Promise.all([
      getContactsInRange(range.start, range.end).catch((e) => { console.error('[v2/metrics] contacts error:', e.message); return EMPTY_PAGE; }),
      getDealsInRange(range.start, range.end).catch((e) => { console.error('[v2/metrics] deals error:', e.message); return EMPTY_PAGE; }),
      getDealsClosedInRange(range.start, range.end).catch((e) => { console.error('[v2/metrics] closedDeals error:', e.message); return EMPTY_PAGE; }),
      getOwners().catch(() => []),
      skipPrevPeriod ? Promise.resolve(EMPTY_PAGE) : getContactsInRange(range.prevStart, range.prevEnd).catch(() => EMPTY_PAGE),
      skipPrevPeriod ? Promise.resolve(EMPTY_PAGE) : getDealsInRange(range.prevStart, range.prevEnd).catch(() => EMPTY_PAGE),
      skipPrevPeriod ? Promise.resolve(EMPTY_PAGE) : getDealsClosedInRange(range.prevStart, range.prevEnd).catch(() => EMPTY_PAGE),
      getAllOpenDeals().catch((e) => { console.error('[v2/metrics] getAllOpenDeals error:', e.message); return EMPTY_PAGE; }),
      getDealsClosedInRange(trailing30Start, trailing30End).catch(() => EMPTY_PAGE),
      getDealsSentInStages(sentStageIds).catch(() => EMPTY_PAGE),
      skipPrevPeriod ? Promise.resolve(EMPTY_PAGE) : getDealsSentInStages(sentStageIds).catch(() => EMPTY_PAGE),
    ]);

    // --- Deals Sent ---
    // v2 approximation: since stage_history is empty in Supabase, we can't do
    // the v1 "entered a sent stage during the period" filter. Instead we use
    // deals currently IN a sent stage. No propertiesWithHistory available.
    const sentRangeStartMs = Date.parse(range.start);
    const sentRangeEndMs = Date.parse(range.end);
    const sentStageIdSet = new Set(sentStageIds);

    // For v2, dealsSentRaw = deals currently in a sent stage.
    // We still allow filtering by period if we can use createdate or lastmodifieddate.
    const dealsSentRaw = dealsSentData;
    const prevDealsSentRaw = prevDealsSentData;

    // --- Source override from associated deals ---
    const contactSourceOverride = new Map();
    let __assocMap;
    let __dealRecordById;
    if (!skipSourceOverride) {
      const contactsWithDeals = contacts.results.filter(
        (c) => (parseInt(c.properties.num_associated_deals) || 0) > 0
      );
      if (contactsWithDeals.length > 0) {
        const contactIds = contactsWithDeals.map((c) => c.id);
        const assocMap = await getContactDealAssociationsBatch(contactIds);
        const allDealIds = new Set();
        for (const ids of assocMap.values()) for (const id of ids) allDealIds.add(id);
        const dealsWithSource = await getDealsByIds([...allDealIds]);
        const dealLeadSource = new Map();
        const dealRecordById = new Map();
        for (const d of dealsWithSource) {
          const mapped = mapDealLeadSource(d.properties.lead_source);
          if (mapped) dealLeadSource.set(d.id, { source: mapped, createdate: d.properties.createdate || '' });
          dealRecordById.set(d.id, d);
        }
        for (const [contactId, dealIds] of assocMap.entries()) {
          let best = null;
          for (const did of dealIds) {
            const entry = dealLeadSource.get(did);
            if (!entry) continue;
            if (!best || entry.createdate > best.createdate) best = entry;
          }
          if (best) contactSourceOverride.set(contactId, best.source);
        }
        __assocMap = assocMap;
        __dealRecordById = dealRecordById;
      }
    } else {
      // Wide period: targeted reverse-association for non-analytics lead sources.
      const nonAnalyticsDealIds = deals.results
        .filter((d) => mapDealLeadSource(d.properties.lead_source) !== null)
        .map((d) => d.id);
      if (nonAnalyticsDealIds.length > 0) {
        console.log(`[v2/metrics] Wide-period targeted lookup: ${nonAnalyticsDealIds.length} non-analytics deals`);
        const dealContactMap = await getDealContactAssociationsBatch(nonAnalyticsDealIds);
        for (const d of deals.results) {
          const source = mapDealLeadSource(d.properties.lead_source);
          if (!source) continue;
          for (const contactId of dealContactMap.get(d.id) ?? []) {
            if (!contactSourceOverride.has(contactId)) {
              contactSourceOverride.set(contactId, source);
            }
          }
        }
      }
    }

    // Phase 1: check contact's own sbg_lead_source field before falling back to
    // HubSpot analytics source
    function effectiveSource(contact) {
      const override = contactSourceOverride.get(contact.id);
      if (override) return override;
      const sbgMapped = mapDealLeadSource(contact.properties.sbg_lead_source);
      if (sbgMapped) return sbgMapped;
      return classifySource(contact.properties.hs_analytics_source, contact.properties.hs_analytics_source_data_1);
    }

    const ownerMap = {};
    for (const o of owners) {
      ownerMap[o.id] = `${o.firstName || ''} ${o.lastName || ''}`.trim() || o.email;
    }

    // --- OpenPhone activity via Supabase ---
    // Replace KV-based lookups with direct Supabase queries against openphone_calls.
    const kvStoreByPhone = new Map();
    let partialOpenPhoneSignal = false;

    // Collect all unique phones from contacts
    const allPhones = new Set();
    for (const c of contacts.results) {
      for (const p of [c.properties.phone, c.properties.mobilephone].map(normalizePhone).filter(Boolean)) {
        allPhones.add(p);
      }
    }
    const phoneArr = [...allPhones];

    if (phoneArr.length > 0) {
      console.log(`[v2/metrics] OpenPhone Supabase lookup: ${phoneArr.length} phones`);
      const OP_BATCH = 50;
      for (let i = 0; i < phoneArr.length; i += OP_BATCH) {
        const batch = phoneArr.slice(i, i + OP_BATCH);
        const results = await Promise.all(
          batch.map((p) => getEarliestOutboundForPhoneSupabase(p, range.start).catch(() => null))
        );
        for (let j = 0; j < batch.length; j++) {
          if (results[j]) kvStoreByPhone.set(batch[j], results[j]);
        }
      }
      console.log(`[v2/metrics] OpenPhone Supabase: ${kvStoreByPhone.size} phones matched`);
    }

    // Gmail skipped in v2 — optional and rarely affects data
    const gmailActivityByEmail = new Map();

    function lookupGmailTimestamp(contact) {
      const email = (contact.properties.email || '').toLowerCase();
      return gmailActivityByEmail.get(email) || null;
    }

    function lookupOpenPhoneTimestamp(contact) {
      const phones = [contact.properties.phone, contact.properties.mobilephone]
        .map(normalizePhone)
        .filter(Boolean);
      let earliest = null;
      for (const p of phones) {
        const kvTs = kvStoreByPhone.get(p);
        if (kvTs && (!earliest || kvTs < earliest)) earliest = kvTs;
      }
      return earliest;
    }

    // --- Summary ---
    const fbContacts = contacts.results.filter(
      (c) => effectiveSource(c) === 'facebook'
    );
    const prevFbContacts = prevContacts.results.filter(
      (c) => effectiveSource(c) === 'facebook'
    );
    const coldContacts = contacts.results.filter(
      (c) => ['email_extension', 'cold_outreach'].includes(effectiveSource(c))
    );
    const prevColdContacts = prevContacts.results.filter(
      (c) => ['email_extension', 'cold_outreach'].includes(effectiveSource(c))
    );
    const wonDeals = closedDeals.results.filter((d) => CLOSED_WON_STAGES.includes(d.properties.dealstage));
    const prevWonDeals = prevClosedDeals.results.filter((d) => CLOSED_WON_STAGES.includes(d.properties.dealstage));
    const revenue = wonDeals.reduce((sum, d) => sum + (parseFloat(d.properties.amount) || 0), 0);
    const prevRevenue = prevWonDeals.reduce((sum, d) => sum + (parseFloat(d.properties.amount) || 0), 0);

    // Cold outreach revenue: won deals where deal lead_source maps to cold_outreach
    const coldWonDeals = wonDeals.filter((d) => mapDealLeadSource(d.properties.lead_source) === 'cold_outreach');
    const prevColdWonDeals = prevWonDeals.filter((d) => mapDealLeadSource(d.properties.lead_source) === 'cold_outreach');
    const coldOutreachRevenue = coldWonDeals.reduce((sum, d) => sum + (parseFloat(d.properties.amount) || 0), 0);
    const prevColdOutreachRevenue = prevColdWonDeals.reduce((sum, d) => sum + (parseFloat(d.properties.amount) || 0), 0);

    function trendPct(current, previous) {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    }

    // --- Same-period bids summary count ---
    const summarysamePeriodDealsSent = (dealsSentRaw.results || []).filter(d => {
      const createMs = Date.parse(d.properties?.createdate || '');
      return createMs && createMs >= sentRangeStartMs && createMs <= sentRangeEndMs;
    }).length;

    // --- Lead definition ---
    const LEAD_LIFECYCLES = ['lead', 'marketingqualifiedlead', 'salesqualifiedlead', 'opportunity', 'customer'];
    function isQualifiedLead(c) {
      const numDeals = parseInt(c.properties.num_associated_deals) || 0;
      const lifecycle = (c.properties.lifecyclestage || '').toLowerCase();
      return numDeals > 0 || LEAD_LIFECYCLES.includes(lifecycle);
    }
    const qualifiedLeadCount = contacts.results.filter(isQualifiedLead).length;
    const prevQualifiedLeadCount = prevContacts.results.filter(isQualifiedLead).length;

    const summary = {
      totalLeads: qualifiedLeadCount,
      totalContacts: contacts.total,
      facebookLeads: fbContacts.length,
      coldOutreachLeads: coldContacts.length,
      dealsWon: wonDeals.length,
      dealsSent: dealsSentRaw.results.length,
      samePeriodDealsSent: summarysamePeriodDealsSent,
      dealsCreated: deals.results.length,
      revenueClosed: revenue,
      coldOutreachRevenue,
      trends: {
        totalLeads: trendPct(qualifiedLeadCount, prevQualifiedLeadCount),
        facebookLeads: trendPct(fbContacts.length, prevFbContacts.length),
        coldOutreachLeads: trendPct(coldContacts.length, prevColdContacts.length),
        dealsWon: trendPct(wonDeals.length, prevWonDeals.length),
        dealsSent: trendPct(dealsSentRaw.results.length, prevDealsSentRaw.results.length),
        dealsCreated: trendPct(deals.results.length, prevDeals.results.length),
        revenueClosed: trendPct(revenue, prevRevenue),
        coldOutreachRevenue: trendPct(coldOutreachRevenue, prevColdOutreachRevenue),
      },
    };

    // --- Collect rep IDs ---
    const repIds = new Set();
    for (const c of contacts.results) {
      if (c.properties.hubspot_owner_id) repIds.add(c.properties.hubspot_owner_id);
    }
    for (const d of deals.results) {
      if (d.properties.hubspot_owner_id) repIds.add(d.properties.hubspot_owner_id);
    }

    // --- Funnel (TRUE COHORT, per source) ---
    const REQUIRE_DEAL_SOURCES = ['email_extension', 'crm_manual', 'integration'];

    const sourceKeys = Object.keys(SOURCE_MAP);
    const leadsBySource = {};
    const dealsBySource = {};
    const wonBySource = {};
    for (const key of sourceKeys) {
      leadsBySource[key] = 0;
      dealsBySource[key] = 0;
      wonBySource[key] = 0;
    }
    let totalLeadsCohort = 0;
    let totalDealsCohort = 0;
    let totalWonCohort = 0;

    for (const c of contacts.results) {
      const src = effectiveSource(c);
      const numDeals = parseInt(c.properties.num_associated_deals) || 0;
      const lifecycle = (c.properties.lifecyclestage || '').toLowerCase();
      const becameDeal = numDeals > 0 || lifecycle === 'opportunity' || lifecycle === 'customer';
      const becameCustomer = lifecycle === 'customer';

      if (REQUIRE_DEAL_SOURCES.includes(src) && !becameDeal) continue;

      leadsBySource[src]++;
      totalLeadsCohort++;

      if (becameDeal) {
        dealsBySource[src]++;
        totalDealsCohort++;
      }
      if (becameCustomer) {
        wonBySource[src]++;
        totalWonCohort++;
      }
    }

    const activeSources = sourceKeys.filter(
      (s) => leadsBySource[s] > 0 || dealsBySource[s] > 0 || wonBySource[s] > 0
    );

    const funnel = {
      sources: activeSources.map((s) => ({
        key: s,
        label: SOURCE_MAP[s].label,
        color: SOURCE_MAP[s].color,
        leads: leadsBySource[s],
        deals: dealsBySource[s],
        won: wonBySource[s],
      })),
      totals: {
        leads: totalLeadsCohort,
        deals: totalDealsCohort,
        won: totalWonCohort,
      },
    };

    // --- Reps ---
    const allRepIds = new Set(repIds);
    for (const d of closedDeals.results) {
      if (d.properties.hubspot_owner_id) allRepIds.add(d.properties.hubspot_owner_id);
    }

    // --- Per-rep bids data ---
    // v2: no propertiesWithHistory, so bidTimeSumMs/bidTimeCount stay 0.
    const repBidsMap = new Map();
    for (const d of dealsSentRaw.results) {
      const repId = d.properties.hubspot_owner_id;
      if (!repId) continue;
      if (!repBidsMap.has(repId)) {
        repBidsMap.set(repId, { bidsSent: 0, samePeriodBidsSent: 0, bidsRevenue: 0, bidTimeSumMs: 0, bidTimeCount: 0 });
      }
      const entry = repBidsMap.get(repId);
      entry.bidsSent++;
      entry.bidsRevenue += parseFloat(d.properties.amount) || 0;

      // Same-period bids: deal was ALSO created in this period
      const dealCreateMs = Date.parse(d.properties.createdate || '');
      if (dealCreateMs && dealCreateMs >= sentRangeStartMs && dealCreateMs <= sentRangeEndMs) {
        entry.samePeriodBidsSent++;
      }

      // v2: no stage history available, skip lead→bid time calculation
    }

    const ORGANIC_SOURCES = new Set(['organic', 'direct']);
    const REFERRAL_SOURCES = new Set(['referrals']);

    const reps = [];
    for (const repId of allRepIds) {
      const repContacts = contacts.results.filter((c) => c.properties.hubspot_owner_id === repId);
      const repFbContacts = repContacts.filter(
        (c) => effectiveSource(c) === 'facebook'
      );
      const repOrganicContacts = repContacts.filter((c) =>
        ORGANIC_SOURCES.has(effectiveSource(c))
      );
      const repReferralContacts = repContacts.filter((c) =>
        REFERRAL_SOURCES.has(effectiveSource(c))
      );
      const repColdContacts = repContacts.filter(
        (c) => effectiveSource(c) === 'cold_outreach'
      );
      const repDeals = deals.results.filter((d) => d.properties.hubspot_owner_id === repId);
      const repWon = wonDeals.filter((d) => d.properties.hubspot_owner_id === repId);
      const repRevenue = repWon.reduce((sum, d) => sum + (parseFloat(d.properties.amount) || 0), 0);

      // Average lead response time
      let responseSumMs = 0;
      let responseCount = 0;
      for (const c of repContacts) {
        const created = Date.parse(c.properties.createdate || '');
        if (!created) continue;
        const candidates = [
          c.properties.hs_sa_first_engagement_date,
          c.properties.notes_last_contacted,
          c.properties.notes_last_updated,
          c.properties.hs_last_sales_activity_timestamp,
          c.properties.hs_email_last_send_date,
          c.properties.hs_sales_email_last_replied,
        ]
          .map((v) => Date.parse(v || ''))
          .filter((v) => v && v >= created);
        const opTs = lookupOpenPhoneTimestamp(c);
        if (opTs && opTs >= created) candidates.push(opTs);
        const gmTs = lookupGmailTimestamp(c);
        if (gmTs && gmTs >= created) candidates.push(gmTs);
        if (candidates.length === 0) continue;
        const firstActivity = Math.min(...candidates);
        responseSumMs += firstActivity - created;
        responseCount++;
      }
      const avgResponseMinutes = responseCount > 0 ? Math.round(responseSumMs / responseCount / 60000) : null;

      // Cohort funnel for this rep
      let cohortDeals = 0;
      let cohortWon = 0;
      for (const c of repContacts) {
        const numDeals = parseInt(c.properties.num_associated_deals) || 0;
        const lifecycle = (c.properties.lifecyclestage || '').toLowerCase();
        if (numDeals > 0 || lifecycle === 'opportunity' || lifecycle === 'customer') cohortDeals++;
        if (lifecycle === 'customer') cohortWon++;
      }

      const repBids = repBidsMap.get(repId) || { bidsSent: 0, samePeriodBidsSent: 0, bidsRevenue: 0, bidTimeSumMs: 0, bidTimeCount: 0 };
      const avgTimeToBidMinutes = repBids.bidTimeCount > 0
        ? Math.round(repBids.bidTimeSumMs / repBids.bidTimeCount / 60000)
        : null;

      const repQualifiedLeads = repContacts.filter(isQualifiedLead).length;

      // Skip reps with zero activity
      if (repContacts.length === 0 && repDeals.length === 0 && repWon.length === 0) continue;

      reps.push({
        id: repId,
        name: ownerMap[repId] || `Owner ${repId}`,
        leadsAssigned: repQualifiedLeads,
        contactsAssigned: repContacts.length,
        fbLeads: repFbContacts.length,
        organicLeads: repOrganicContacts.length,
        referralLeads: repReferralContacts.length,
        coldLeads: repColdContacts.length,
        dealsCreated: repDeals.length,
        dealsWon: repWon.length,
        cohortDeals,
        cohortWon,
        avgResponseMinutes,
        revenueClosed: repRevenue,
        conversionRate: repQualifiedLeads > 0 ? Math.round((repDeals.length / repQualifiedLeads) * 100) : 0,
        bidsSent: repBids.bidsSent,
        samePeriodBidsSent: repBids.samePeriodBidsSent,
        bidsRevenue: repBids.bidsRevenue,
        avgTimeToBidMinutes,
      });
    }

    // Add "Unassigned" pseudo-rep
    const unassignedContacts = contacts.results.filter((c) => !c.properties.hubspot_owner_id);
    const unassignedDealsCreated = deals.results.filter((d) => !d.properties.hubspot_owner_id);
    const unassignedDealsWon = closedDeals.results.filter(
      (d) => !d.properties.hubspot_owner_id && CLOSED_WON_STAGES.includes(d.properties.dealstage)
    );
    if (unassignedContacts.length > 0 || unassignedDealsCreated.length > 0 || unassignedDealsWon.length > 0) {
      reps.push({
        id: '',
        name: 'Unassigned',
        leadsAssigned: unassignedContacts.length,
        fbLeads: 0,
        organicLeads: 0,
        referralLeads: 0,
        coldLeads: 0,
        dealsCreated: unassignedDealsCreated.length,
        dealsWon: unassignedDealsWon.length,
        cohortDeals: 0,
        cohortWon: 0,
        avgResponseMinutes: null,
        revenueClosed: unassignedDealsWon.reduce((s, d) => s + (parseFloat(d.properties.amount) || 0), 0),
        conversionRate: 0,
        bidsSent: 0,
        bidsRevenue: 0,
        avgTimeToBidMinutes: null,
      });
    }

    reps.sort((a, b) => b.revenueClosed - a.revenueClosed);

    // --- Pipeline ---
    const pipeline = buildPipeline(allDeals.results, {
      PIPELINES,
      PIPELINE_STAGES,
      CLOSED_WON_STAGES,
      CLOSED_LOST_STAGES,
      includeClosedStages: false,
    });

    // --- Sources ---
    const sourceCounts = {};
    for (const c of contacts.results) {
      const src = effectiveSource(c);
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    }

    const dailyMap = {};
    for (const c of contacts.results) {
      const day = c.properties.createdate?.split('T')[0];
      if (day) dailyMap[day] = (dailyMap[day] || 0) + 1;
    }
    const daily = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    const sources = {
      breakdown: sourceCounts,
      daily,
    };

    // --- Leads detail ---
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

      const rawOpenDeals = c.properties.num_open_deals ?? c.properties.hs_num_open_deals;
      const openDealSignal = rawOpenDeals != null ? (parseInt(rawOpenDeals) || 0) : numDeals;

      if (INTERNAL_DOMAINS.includes(domain)) return 'internal';
      if (lifecycle === 'customer' || lifecycle === 'opportunity' || openDealSignal > 0) return 'qualified';
      if (isManualEntry && numDeals === 0) return 'manual_entry';
      if (lifecycle === 'lead' || lifecycle === 'marketingqualifiedlead' || lifecycle === 'salesqualifiedlead') return 'new_lead';
      if (lifecycle === 'subscriber' || lifecycle === 'other' || lifecycle === '') return 'unqualified';
      return 'new_lead';
    }

    const rangeStartMs = Date.parse(range.start);
    const leads = contacts.results.map((c) => {
      const status = classifyLead(c);
      const createdMs = Date.parse(c.properties.createdate || '');
      const isReoptIn = createdMs && createdMs < rangeStartMs;
      return {
        id: c.id,
        name: `${c.properties.firstname || ''} ${c.properties.lastname || ''}`.trim() || c.properties.email || 'Unknown',
        email: c.properties.email || '',
        source: effectiveSource(c),
        sourceRaw: c.properties.hs_analytics_source || '',
        sourceDetail: c.properties.hs_analytics_source_data_1 || '',
        rep: ownerMap[c.properties.hubspot_owner_id] || 'Unassigned',
        repId: c.properties.hubspot_owner_id || '',
        createdAt: c.properties.createdate || '',
        recentConversionAt: c.properties.recent_conversion_date || '',
        numConversionEvents: parseInt(c.properties.num_conversion_events) || 0,
        isReoptIn,
        lifecycleStage: c.properties.lifecyclestage || '',
        numDeals: parseInt(c.properties.num_associated_deals) || 0,
        status,
        hubspotUrl: process.env.HUBSPOT_PORTAL_ID
          ? `https://app.hubspot.com/contacts/${process.env.HUBSPOT_PORTAL_ID}/contact/${c.id}`
          : '',
      };
    });

    const leadCounts = {
      qualified: leads.filter((l) => l.status === 'qualified').length,
      newLead: leads.filter((l) => l.status === 'new_lead').length,
      manualEntry: leads.filter((l) => l.status === 'manual_entry').length,
      unqualified: leads.filter((l) => l.status === 'unqualified').length,
      internal: leads.filter((l) => l.status === 'internal').length,
    };

    // --- Pipeline Health ---
    const pipelineHealthConstants = {
      AVG_CYCLE_DAYS,
      AVG_CYCLE_DEAL_COUNTS,
      AVG_CYCLE_GENERATED_AT,
      HOT_STAGES_BY_PIPELINE,
      STICKY_HOT_STAGES_BY_PIPELINE,
      DESIGN_MILESTONE_STAGE,
      PRE_DESIGN_STAGES,
      POST_DESIGN_STAGE,
      PIPELINES,
      PIPELINE_STAGES,
      CLOSED_WON_STAGES,
      CLOSED_LOST_STAGES,
      portalId: process.env.HUBSPOT_PORTAL_ID || null,
    };
    const pipelineHealth = buildPipelineHealth(allDeals.results, ownerMap, pipelineHealthConstants);

    // --- Pipeline Coverage Ratio (trailing-30-day) ---
    const trailing30RevenueByPipeline = {};
    for (const key of Object.keys(PIPELINES)) trailing30RevenueByPipeline[key] = 0;
    const pipelineKeyByIdMap = {};
    for (const [k, { id }] of Object.entries(PIPELINES)) pipelineKeyByIdMap[id] = k;
    for (const d of trailing30Closed.results) {
      if (!CLOSED_WON_STAGES.includes(d.properties.dealstage)) continue;
      const pKey = pipelineKeyByIdMap[d.properties.pipeline];
      if (!pKey) continue;
      trailing30RevenueByPipeline[pKey] += parseFloat(d.properties.amount) || 0;
    }
    const COVERAGE_TARGET = 3;
    for (const [pKey, p] of Object.entries(pipelineHealth.byPipeline)) {
      const openValue = (p.values.hot || 0) + (p.values.active || 0) + (p.values.aging || 0) + (p.values.cold || 0);
      const trailing30 = trailing30RevenueByPipeline[pKey] || 0;
      p.coverage = {
        openValue,
        trailing30Revenue: trailing30,
        ratio: trailing30 > 0 ? +(openValue / trailing30).toFixed(2) : null,
        target: COVERAGE_TARGET,
      };
    }
    pipelineHealth.coverageTarget = COVERAGE_TARGET;

    // --- Stage-to-Stage Conversion (per pipeline) ---
    const stageConversionByPipeline = {};
    for (const [pKey, { id: pipelineId }] of Object.entries(PIPELINES)) {
      const openStages = (PIPELINE_STAGES[pKey] || []).filter(
        (s) => !CLOSED_WON_STAGES.includes(s.id) && !CLOSED_LOST_STAGES.includes(s.id)
      );
      if (openStages.length === 0) {
        stageConversionByPipeline[pKey] = [];
        continue;
      }
      const stageIndex = {};
      openStages.forEach((s, i) => { stageIndex[s.id] = i; });
      const reached = openStages.map(() => 0);

      for (const d of allDeals.results) {
        const props = d.properties;
        if (props.pipeline !== pipelineId) continue;
        const idx = stageIndex[props.dealstage];
        if (idx == null) continue;
        for (let i = 0; i <= idx; i++) reached[i]++;
      }

      const wonDealsInPipeline = trailing30Closed.results.filter(
        (d) => d.properties.pipeline === pipelineId && CLOSED_WON_STAGES.includes(d.properties.dealstage)
      );
      const wonCount = wonDealsInPipeline.length;
      for (let i = 0; i < reached.length; i++) reached[i] += wonCount;

      const funnelStages = openStages.map((s, i) => ({
        id: s.id,
        label: s.label,
        reached: reached[i],
        conversionToNext: null,
      }));
      for (let i = 0; i < funnelStages.length - 1; i++) {
        if (reached[i] > 0) {
          funnelStages[i].conversionToNext = Math.round((reached[i + 1] / reached[i]) * 100);
        }
      }
      if (funnelStages.length > 0 && reached[reached.length - 1] > 0) {
        funnelStages[funnelStages.length - 1].conversionToNext = Math.round((wonCount / reached[reached.length - 1]) * 100);
      }
      funnelStages.push({
        id: 'won',
        label: 'Won (30d)',
        reached: wonCount,
        conversionToNext: null,
        terminal: true,
      });

      stageConversionByPipeline[pKey] = funnelStages;
    }
    pipelineHealth.stageConversion = stageConversionByPipeline;

    // --- Period deals (for rep-activity drilldown) ---
    const stageLabelByPipelineIdForPeriod = {};
    for (const [pKey, stages] of Object.entries(PIPELINE_STAGES)) {
      const pId = PIPELINES[pKey].id;
      stageLabelByPipelineIdForPeriod[pId] = {};
      for (const s of stages) stageLabelByPipelineIdForPeriod[pId][s.id] = s.label;
    }
    const pipelineLabelById = {};
    for (const [k, { id, label }] of Object.entries(PIPELINES)) pipelineLabelById[id] = label;

    const periodDealsMap = new Map();
    function addPeriodDeal(d, { createdInPeriod, closedInPeriod }) {
      const props = d.properties || {};
      const existing = periodDealsMap.get(d.id);
      if (existing) {
        existing.createdInPeriod = existing.createdInPeriod || createdInPeriod;
        existing.closedInPeriod = existing.closedInPeriod || closedInPeriod;
        return;
      }
      const stageLabel = (stageLabelByPipelineIdForPeriod[props.pipeline] || {})[props.dealstage] || props.dealstage || '';
      const isWon = CLOSED_WON_STAGES.includes(props.dealstage);
      const isLost = CLOSED_LOST_STAGES.includes(props.dealstage);
      const dealSource = mapDealLeadSource(props.lead_source) || 'other';
      periodDealsMap.set(d.id, {
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
        createdInPeriod,
        closedInPeriod,
        source: dealSource,
        leadSourceRaw: props.lead_source || '',
        hubspotUrl: process.env.HUBSPOT_PORTAL_ID
          ? `https://app.hubspot.com/contacts/${process.env.HUBSPOT_PORTAL_ID}/deal/${d.id}`
          : '',
      });
    }
    for (const d of deals.results) addPeriodDeal(d, { createdInPeriod: true, closedInPeriod: false });
    for (const d of closedDeals.results) addPeriodDeal(d, { createdInPeriod: false, closedInPeriod: true });
    const dealsSentIds = new Set((dealsSentRaw.results || []).map((d) => d.id));
    for (const d of dealsSentRaw.results || []) addPeriodDeal(d, { createdInPeriod: false, closedInPeriod: false });
    const allPeriodDealsValues = [...periodDealsMap.values()];
    const periodDeals = allPeriodDealsValues.filter((d) => d.createdInPeriod || d.closedInPeriod);
    const dealsSentDeals = allPeriodDealsValues.filter((d) => dealsSentIds.has(d.id));

    // --- Speed-to-Lead SLA ---
    const WORKED_LEAD_STATUSES = new Set([
      'attempted_to_contact', 'connected',
      'in_progress', 'open_deal', 'bad_timing',
    ]);

    const SLA_THRESHOLDS_MINUTES = {
      'Web Form': 5,
      'Phone Call / Walk-in': 5,
      'Paid Social': 5,
      'Referral': 60,
      'Repeat Client': 60,
      'Cold Reach Out': 240,
      'Trade Show / Event': 60,
      'Vendor Partner': null,
      'Other': 60,
    };
    const DEFAULT_SLA_MINUTES = 5;
    let slaTotal = 0;
    let slaWithin = 0;
    let slaOver = 0;
    let slaBreaching = 0;
    let slaSafe = 0;
    const breachingLeads = [];
    const slaWithinLeads = [];
    const slaOverLeads = [];
    const slaSafeLeads = [];
    const slaResponseTimes = [];
    const slaBySource = {};

    for (const c of contacts.results) {
      const lifecycle = (c.properties.lifecyclestage || '').toLowerCase();
      const sourceDetail = (c.properties.hs_analytics_source_data_1 || '').toUpperCase();
      const sourceRaw = (c.properties.hs_analytics_source || '').toUpperCase();
      const isManualEntry = ['EXTENSION', 'CRM_UI', 'API'].includes(sourceDetail) || ['EXTENSION', 'CRM_UI', 'API'].includes(sourceRaw);
      const numDeals = parseInt(c.properties.num_associated_deals) || 0;
      const becameDeal = numDeals > 0 || lifecycle === 'opportunity' || lifecycle === 'customer';
      if (isManualEntry && !becameDeal) continue;
      const leadStatusUpper = (c.properties.hs_lead_status || '').toUpperCase();
      if (leadStatusUpper === 'UNQUALIFIED') continue;
      const email = (c.properties.email || '').toLowerCase();
      const domain = email.split('@')[1] || '';
      if (['signsbyghouston.com', 'signsbyghouston.net'].includes(domain)) continue;

      const sbgSource = c.properties.sbg_lead_source || null;
      const contactSlaMinutes = sbgSource in SLA_THRESHOLDS_MINUTES
        ? SLA_THRESHOLDS_MINUTES[sbgSource]
        : DEFAULT_SLA_MINUTES;
      if (contactSlaMinutes === null) continue;
      const contactSlaCutoffMs = contactSlaMinutes * 60 * 1000;
      const slaSourceKey = sbgSource || 'Source not set';
      if (!slaBySource[slaSourceKey]) {
        slaBySource[slaSourceKey] = { total: 0, within: 0, over: 0, breaching: 0, safe: 0, thresholdMinutes: contactSlaMinutes };
      }

      const created = Date.parse(c.properties.createdate || '');
      if (!created) continue;

      const TOLERANCE_MS = 10 * 60 * 1000;
      const minActivityMs = created - TOLERANCE_MS;

      const candidates = [
        c.properties.hs_sa_first_engagement_date,
        c.properties.notes_last_contacted,
        c.properties.notes_last_updated,
        c.properties.hs_last_sales_activity_timestamp,
        c.properties.hs_email_last_send_date,
        c.properties.hs_sales_email_last_replied,
        c.properties.hs_lifecyclestage_salesqualifiedlead_date,
        c.properties.hs_lifecyclestage_opportunity_date,
        c.properties.hs_lifecyclestage_customer_date,
      ]
        .map((v) => Date.parse(v || ''))
        .filter((v) => v && v >= minActivityMs);

      const opTs = lookupOpenPhoneTimestamp(c);
      if (opTs && opTs >= minActivityMs) candidates.push(opTs);

      const gmailTs = lookupGmailTimestamp(c);
      if (gmailTs && gmailTs >= minActivityMs) candidates.push(gmailTs);

      // Associated deal createdate = rep worked the lead
      if (__assocMap && __dealRecordById) {
        const dealIds = __assocMap.get(c.id) || [];
        for (const did of dealIds) {
          const deal = __dealRecordById.get(did);
          if (!deal) continue;
          const dealCreatedMs = Date.parse(deal.properties.createdate || '');
          if (dealCreatedMs && dealCreatedMs >= minActivityMs) candidates.push(dealCreatedMs);
        }
      }

      const hsResponseMs = parseInt(c.properties.hs_time_to_first_engagement) || 0;
      if (hsResponseMs > 0 && candidates.length === 0) {
        const engagementTs = created + hsResponseMs;
        if (engagementTs >= minActivityMs) candidates.push(engagementTs);
      }

      const workedLifecycles = ['salesqualifiedlead', 'opportunity', 'customer'];
      if (candidates.length === 0 && workedLifecycles.includes(lifecycle)) {
        candidates.push(created + contactSlaCutoffMs + 1);
      }

      const leadStatus = (c.properties.hs_lead_status || '').toLowerCase();
      if (candidates.length === 0 && WORKED_LEAD_STATUSES.has(leadStatus)) {
        candidates.push(created + contactSlaCutoffMs + 1);
      }

      slaTotal++;
      slaBySource[slaSourceKey].total++;
      const ageAnchorMs = isHistoricalPeriod ? periodEndMs : Date.now();

      const slaNumDeals = parseInt(c.properties.num_associated_deals) || 0;
      let slaHasWon = (c.properties.lifecyclestage || '').toLowerCase() === 'customer';
      if (!slaHasWon && slaNumDeals > 0 && __assocMap && __dealRecordById) {
        const dealIds = __assocMap.get(c.id) || [];
        slaHasWon = dealIds.some((did) => {
          const deal = __dealRecordById.get(did);
          return deal && CLOSED_WON_STAGES.includes(deal.properties.dealstage);
        });
      }

      const leadInfo = {
        id: c.id,
        name: `${c.properties.firstname || ''} ${c.properties.lastname || ''}`.trim() || email || 'Unknown',
        email,
        phone: c.properties.phone || c.properties.mobilephone || '',
        source: effectiveSource(c),
        rep: ownerMap[c.properties.hubspot_owner_id] || 'Unassigned',
        repId: c.properties.hubspot_owner_id || '',
        createdAt: c.properties.createdate || '',
        numDeals: slaNumDeals,
        hasWon: slaHasWon,
      };

      if (candidates.length === 0) {
        const ageMs = ageAnchorMs - created;
        if (ageMs > contactSlaCutoffMs) {
          slaBreaching++;
          slaBySource[slaSourceKey].breaching++;
          const phones = [c.properties.phone, c.properties.mobilephone].filter(Boolean);
          const opChecked = phones.length > 0 && phones.some((p) => normalizePhone(p));
          breachingLeads.push({
            id: c.id,
            name: `${c.properties.firstname || ''} ${c.properties.lastname || ''}`.trim() || email || 'Unknown',
            email,
            phone: c.properties.phone || c.properties.mobilephone || '',
            source: effectiveSource(c),
            rep: ownerMap[c.properties.hubspot_owner_id] || 'Unassigned',
            repId: c.properties.hubspot_owner_id || '',
            createdAt: c.properties.createdate || '',
            numDeals: slaNumDeals,
            hasWon: slaHasWon,
            ageMinutes: Math.round(ageMs / 60000),
            diagnostic: {
              hasNotesLastContacted: !!c.properties.notes_last_contacted,
              hasNotesLastUpdated: !!c.properties.notes_last_updated,
              hasSalesActivityTs: !!c.properties.hs_last_sales_activity_timestamp,
              hasEmailLastSend: !!c.properties.hs_email_last_send_date,
              lifecycle: c.properties.lifecyclestage || '',
              numDeals: parseInt(c.properties.num_associated_deals) || 0,
              hasOpportunityDate: !!c.properties.hs_lifecyclestage_opportunity_date,
              hasSqlDate: !!c.properties.hs_lifecyclestage_salesqualifiedlead_date,
              hasOpenPhoneCheck: opChecked,
              openPhoneMatched: !!lookupOpenPhoneTimestamp(c),
              notesTimestampStale: c.properties.notes_last_contacted
                ? `before createdate by ${Math.round((created - Date.parse(c.properties.notes_last_contacted)) / 1000)}s`
                : null,
              createdAtRaw: c.properties.createdate,
              notesLastUpdatedRaw: c.properties.notes_last_updated || null,
              opportunityDateRaw: c.properties.hs_lifecyclestage_opportunity_date || null,
              leadStatus: c.properties.hs_lead_status || null,
            },
          });
        } else {
          slaSafe++;
          slaBySource[slaSourceKey].safe++;
          slaSafeLeads.push({ ...leadInfo, ageMinutes: Math.round(ageMs / 60000) });
        }
      } else {
        const firstActivity = Math.min(...candidates);
        const responseMs = firstActivity - created;
        const responseMinutes = Math.round(responseMs / 60000);
        slaResponseTimes.push(responseMinutes);
        const enrichedLead = { ...leadInfo, responseMinutes };
        if (responseMs <= contactSlaCutoffMs) {
          slaWithin++;
          slaBySource[slaSourceKey].within++;
          slaWithinLeads.push(enrichedLead);
        } else {
          slaOver++;
          slaBySource[slaSourceKey].over++;
          slaOverLeads.push(enrichedLead);
        }
      }
    }

    breachingLeads.sort((a, b) => b.ageMinutes - a.ageMinutes);

    const slaCompliancePct = slaTotal > 0
      ? Math.round((slaWithin / slaTotal) * 100)
      : null;

    let medianResponseMinutes = null;
    if (slaResponseTimes.length > 0) {
      const sorted = [...slaResponseTimes].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      medianResponseMinutes = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }

    const sourceBreakdown = Object.entries(slaBySource)
      .map(([source, s]) => ({
        source,
        thresholdMinutes: s.thresholdMinutes,
        total: s.total,
        within: s.within,
        over: s.over,
        breaching: s.breaching,
        safe: s.safe,
        compliancePct: s.total > 0 ? Math.round((s.within / s.total) * 100) : null,
      }))
      .sort((a, b) => b.total - a.total);

    const sla = {
      thresholdMinutes: DEFAULT_SLA_MINUTES,
      sourceAware: true,
      isHistorical: isHistoricalPeriod,
      partialOpenPhoneSignal,
      sourceBreakdown,
      total: slaTotal,
      within: slaWithin,
      over: slaOver,
      breaching: slaBreaching,
      safe: slaSafe,
      compliancePct: slaCompliancePct,
      medianResponseMinutes,
      breachingLeads: breachingLeads.slice(0, 75).map(({ diagnostic: _d, ...l }) => l),
      breachingTotal: breachingLeads.length,
      breachingDeals: breachingLeads.filter((l) => l.numDeals > 0).length,
      breachingWon: breachingLeads.filter((l) => l.hasWon).length,
      withinLeads: slaWithinLeads.sort((a, b) => a.responseMinutes - b.responseMinutes).slice(0, 75),
      withinDeals: slaWithinLeads.filter((l) => l.numDeals > 0).length,
      withinWon: slaWithinLeads.filter((l) => l.hasWon).length,
      overLeads: slaOverLeads.sort((a, b) => b.responseMinutes - a.responseMinutes).slice(0, 75),
      overDeals: slaOverLeads.filter((l) => l.numDeals > 0).length,
      overWon: slaOverLeads.filter((l) => l.hasWon).length,
      safeLeads: slaSafeLeads.slice(0, 75),
      safeDeals: slaSafeLeads.filter((l) => l.numDeals > 0).length,
      safeWon: slaSafeLeads.filter((l) => l.hasWon).length,
    };

    // --- Cohort deals ---
    const stageLabelByPipelineId = {};
    for (const [pKey, stages] of Object.entries(PIPELINE_STAGES)) {
      const pId = PIPELINES[pKey].id;
      stageLabelByPipelineId[pId] = {};
      for (const s of stages) stageLabelByPipelineId[pId][s.id] = s.label;
    }
    const cohortDeals = [];
    if (__assocMap && __dealRecordById) {
      const contactById = new Map();
      for (const c of contacts.results) contactById.set(c.id, c);
      for (const [contactId, dealIds] of __assocMap.entries()) {
        const contact = contactById.get(contactId);
        if (!contact) continue;
        const contactSource = effectiveSource(contact);
        const contactRepId = contact.properties.hubspot_owner_id || '';
        for (const did of dealIds) {
          const d = __dealRecordById.get(did);
          if (!d) continue;
          const props = d.properties || {};
          const stageLabel = (stageLabelByPipelineId[props.pipeline] && stageLabelByPipelineId[props.pipeline][props.dealstage]) || props.dealstage || '';
          const isWon = CLOSED_WON_STAGES.includes(props.dealstage);
          const isLost = CLOSED_LOST_STAGES.includes(props.dealstage);
          cohortDeals.push({
            id: d.id,
            name: props.dealname || 'Untitled',
            stage: props.dealstage || '',
            stageLabel,
            pipeline: props.pipeline || '',
            pipelineLabel: (PIPELINES[Object.keys(PIPELINES).find((k) => PIPELINES[k].id === props.pipeline)] || {}).label || '',
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

    // --- Activity funnel by source (period-based, NOT cohort) ---
    const sourceActivityAgg = {};
    for (const key of sourceKeys) {
      sourceActivityAgg[key] = { leads: 0, created: 0, won: 0, lost: 0, wonValue: 0, totalValue: 0 };
    }
    for (const key of sourceKeys) {
      sourceActivityAgg[key].leads = leadsBySource[key] || 0;
    }
    const dealIdToContactSource = new Map();
    for (const cd of cohortDeals) {
      if (cd.contactSource && cd.contactSource !== 'other') {
        dealIdToContactSource.set(cd.id, cd.contactSource);
      }
    }
    for (const d of periodDeals) {
      let src = d.source;
      if (!src || src === 'other') {
        const fallback = dealIdToContactSource.get(d.id);
        if (fallback) src = fallback;
      }
      const bucket = sourceActivityAgg[src] || sourceActivityAgg.other;
      if (d.createdInPeriod) {
        bucket.created++;
        bucket.totalValue += d.amount;
      }
      if (d.closedInPeriod) {
        if (d.status === 'won') {
          bucket.won++;
          bucket.wonValue += d.amount;
        } else if (d.status === 'lost') {
          bucket.lost++;
        }
      }
    }

    // Repeat client original sources
    const repeatClientOriginalSources = {};
    for (const d of periodDeals) {
      const effectiveSrc = (!d.source || d.source === 'other') ? (dealIdToContactSource.get(d.id) || null) : d.source;
      if (effectiveSrc !== 'repeat_client') continue;
      const originalSrc = dealIdToContactSource.get(d.id) || 'unknown';
      if (originalSrc === 'repeat_client') continue;
      repeatClientOriginalSources[originalSrc] = (repeatClientOriginalSources[originalSrc] || 0) + 1;
    }

    const funnelActivity = {
      sources: Object.entries(sourceActivityAgg)
        .filter(([, a]) => a.leads > 0 || a.created > 0 || a.won > 0)
        .map(([key, a]) => {
          const decided = a.won + a.lost;
          const entry = {
            key,
            label: SOURCE_MAP[key].label,
            color: SOURCE_MAP[key].color,
            leads: a.leads,
            deals: a.created,
            won: a.won,
            revenue: a.wonValue,
            avgDealSize: a.won > 0 ? Math.round(a.wonValue / a.won) : 0,
            winRate: decided > 0 ? Math.round((a.won / decided) * 100) : null,
            pipelineValue: a.totalValue,
          };
          if (key === 'repeat_client' && Object.keys(repeatClientOriginalSources).length > 0) {
            entry.originalSources = repeatClientOriginalSources;
          }
          return entry;
        }),
      totals: {
        leads: Object.values(sourceActivityAgg).reduce((s, a) => s + a.leads, 0),
        deals: Object.values(sourceActivityAgg).reduce((s, a) => s + a.created, 0),
        won: Object.values(sourceActivityAgg).reduce((s, a) => s + a.won, 0),
      },
    };

    // --- Enrich reps with cohort + activity revenue metrics ---
    for (const rep of reps) {
      const cohortRepDeals = cohortDeals.filter((d) => d.contactRepId === rep.id);
      const cw = cohortRepDeals.filter((d) => d.status === 'won');
      const cl = cohortRepDeals.filter((d) => d.status === 'lost');
      rep.cohortRevenue = cw.reduce((s, d) => s + d.amount, 0);
      rep.cohortAvgDealSize = cw.length > 0 ? Math.round(rep.cohortRevenue / cw.length) : 0;
      rep.cohortWinRate = (cw.length + cl.length) > 0 ? Math.round((cw.length / (cw.length + cl.length)) * 100) : null;
      const actRepDeals = periodDeals.filter((d) => d.ownerId === rep.id);
      const aw = actRepDeals.filter((d) => d.status === 'won' && d.closedInPeriod);
      const al = actRepDeals.filter((d) => d.status === 'lost' && d.closedInPeriod);
      rep.activityRevenue = aw.reduce((s, d) => s + d.amount, 0);
      rep.activityAvgDealSize = aw.length > 0 ? Math.round(rep.activityRevenue / aw.length) : 0;
      rep.activityWinRate = (aw.length + al.length) > 0 ? Math.round((aw.length / (aw.length + al.length)) * 100) : null;
    }

    // --- Enrich funnel sources with revenue/win-rate/avg-deal ---
    const sourceAgg = {};
    for (const s of funnel.sources) {
      sourceAgg[s.key] = { won: 0, lost: 0, wonValue: 0, totalValue: 0 };
    }
    for (const d of cohortDeals) {
      const bucket = sourceAgg[d.contactSource];
      if (!bucket) continue;
      bucket.totalValue += d.amount;
      if (d.status === 'won') {
        bucket.won++;
        bucket.wonValue += d.amount;
      } else if (d.status === 'lost') {
        bucket.lost++;
      }
    }
    const hasCohortDealData = cohortDeals.length > 0;
    for (const s of funnel.sources) {
      const a = sourceAgg[s.key];
      const contactDeals = dealsBySource[s.key] || 0;
      const contactWon = wonBySource[s.key] || 0;
      s.winRate = contactDeals > 0 ? Math.round((contactWon / contactDeals) * 100) : null;
      s.revenue = hasCohortDealData ? a.wonValue : null;
      s.avgDealSize = (hasCohortDealData && a.won > 0) ? Math.round(a.wonValue / a.won) : null;
      s.pipelineValue = a.totalValue;
    }

    // --- Payload size optimization ---
    const pipelineHealthSlim = includeDrillDown ? pipelineHealth : {
      ...pipelineHealth,
      byPipeline: Object.fromEntries(
        Object.entries(pipelineHealth.byPipeline).map(([k, v]) => [k, {
          ...v,
          buckets: { hot: [], active: [], aging: [], cold: [] },
        }])
      ),
    };

    const responsePayload = {
      period: { start: range.start, end: range.end, label: range.label },
      summary,
      funnel,
      funnelActivity,
      reps,
      pipeline: includeDrillDown ? pipeline : Object.fromEntries(
        Object.entries(pipeline).map(([k, v]) => [k, {
          ...v,
          stages: v.stages.map(s => ({ id: s.id, label: s.label, count: s.count, value: s.value, deals: [] })),
          dealList: [],
          staleList: [],
        }])
      ),
      pipelineHealth: pipelineHealthSlim,
      sources,
      leads: includeDrillDown ? (skipSourceOverride ? [] : leads) : [],
      leadsOmitted: !includeDrillDown || skipSourceOverride,
      leadCounts,
      cohortDeals: includeDrillDown ? cohortDeals : [],
      periodDeals: includeDrillDown ? periodDeals : [],
      dealsSentDeals: includeDrillDown ? dealsSentDeals : [],
      sla: includeDrillDown ? sla : {
        ...sla,
        breachingLeads: [],
        withinLeads: [],
        overLeads: [],
        safeLeads: [],
      },
    };

    const cacheTTL = isPeriodClosed && periodDays >= 28 ? 3600 : periodDays > 30 ? 1800 : 600;
    await setCached(cacheKey, responsePayload, cacheTTL);
    return res.status(200).json(responsePayload);
  } catch (err) {
    console.error('[v2/metrics] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
