import { getContactsInRange, getDealsInRange, getDealsClosedInRange, getAllOpenDeals, getOwners, getContactDealAssociationsBatch, getDealContactAssociationsBatch, getDealsByIds, getDealsEnteredSentStages, getDealsByIdsWithStageHistory } from './_lib/sales/hubspot.js';
import { normalizePhone } from './_lib/sales/openphone.js';
import { getEarliestOutboundForPhone } from './_lib/sales/callsStore.js';
import { buildGmailActivityMap, GMAIL_ENABLED } from './_lib/sales/gmail.js';
import { getDateRange } from './_lib/sales/periods.js';
import {
  PIPELINES, CLOSED_WON_STAGES, CLOSED_LOST_STAGES,
  PIPELINE_STAGES, SOURCE_MAP, classifySource, mapDealLeadSource,
  AVG_CYCLE_DAYS, AVG_CYCLE_DEAL_COUNTS, AVG_CYCLE_GENERATED_AT,
  HOT_STAGES_BY_PIPELINE, STICKY_HOT_STAGES_BY_PIPELINE, DESIGN_MILESTONE_STAGE,
  PRE_DESIGN_STAGES, POST_DESIGN_STAGE, DEALS_SENT_STAGES,
} from './_lib/sales/constants.js';
import { buildPipelineHealth } from './_lib/sales/pipelineHealthBuilder.js';
import { buildPipeline } from './_lib/sales/pipelineBuilder.js';
import { getCached, setCached } from './_lib/cache.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { period = 'today', start: customStart, end: customEnd, nocache, include } = req.query;
    const forceRefresh = nocache === '1';
    const includeDrillDown = include === 'deals';
    const range = getDateRange(period, customStart, customEnd);

    const baseCacheKey = `metricsv19:${period}:${customStart || ''}:${customEnd || ''}`;
    const cacheKey = includeDrillDown ? `${baseCacheKey}:full` : baseCacheKey;
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

    const periodDays = (Date.parse(range.end) - Date.parse(range.start)) / 86400000;
    const periodEndMs = Date.parse(range.end);
    const isHistoricalPeriod = Date.now() - periodEndMs > 60 * 60 * 1000;
    const skipSourceOverride = periodDays > 14;
    const skipPrevPeriod = periodDays > 30;
    const OP_BUDGET_MS = parseInt(process.env.OPENPHONE_BUDGET_MS || '30000');
    const OP_BATCH = parseInt(process.env.OPENPHONE_CONCURRENCY || '50');
    if (skipSourceOverride) console.log(`[metrics] Skipping source override for ${Math.round(periodDays)}-day period`);
    if (skipPrevPeriod) console.log(`[metrics] Skipping prev-period fetches for ${Math.round(periodDays)}-day period`);

    const now30 = new Date();
    const trailing30Start = new Date(now30.getTime() - 30 * 86400000).toISOString();
    const trailing30End = now30.toISOString();

    const OPEN_DEALS_CACHE_KEY = 'opendeals:v1';
    let allDeals = forceRefresh ? null : await getCached(OPEN_DEALS_CACHE_KEY);
    if (!allDeals) {
      allDeals = await getAllOpenDeals().catch((e) => {
        console.error('[metrics] getAllOpenDeals error (pipeline/health will be empty):', e.message);
        return { results: [], total: 0 };
      });
      if (allDeals.results.length > 0) {
        await setCached(OPEN_DEALS_CACHE_KEY, allDeals, 600);
      }
    } else {
      console.log('[metrics] allDeals cache HIT');
    }

    const trailing30DateKey = trailing30Start.split('T')[0];
    const TRAILING30_CACHE_KEY = `trailing30closed:v1:${trailing30DateKey}`;
    let trailing30Closed = await getCached(TRAILING30_CACHE_KEY);
    if (!trailing30Closed) {
      trailing30Closed = await getDealsClosedInRange(trailing30Start, trailing30End).catch(() => ({ results: [], total: 0 }));
      await setCached(TRAILING30_CACHE_KEY, trailing30Closed, 600);
    } else {
      console.log('[metrics] trailing30Closed cache HIT');
    }

    const EMPTY_PAGE = { results: [], total: 0 };
    const [
      contacts,
      deals,
      closedDeals,
      owners,
      prevContacts,
      prevDeals,
      prevClosedDeals,
    ] = await Promise.all([
      getContactsInRange(range.start, range.end).catch((e) => { console.error('[metrics] contacts error:', e.message); return EMPTY_PAGE; }),
      getDealsInRange(range.start, range.end).catch((e) => { console.error('[metrics] deals error:', e.message); return EMPTY_PAGE; }),
      getDealsClosedInRange(range.start, range.end).catch((e) => { console.error('[metrics] closedDeals error:', e.message); return EMPTY_PAGE; }),
      getOwners().catch(() => []),
      skipPrevPeriod ? Promise.resolve(EMPTY_PAGE) : getContactsInRange(range.prevStart, range.prevEnd).catch(() => EMPTY_PAGE),
      skipPrevPeriod ? Promise.resolve(EMPTY_PAGE) : getDealsInRange(range.prevStart, range.prevEnd).catch(() => EMPTY_PAGE),
      skipPrevPeriod ? Promise.resolve(EMPTY_PAGE) : getDealsClosedInRange(range.prevStart, range.prevEnd).catch(() => EMPTY_PAGE),
    ]);

    const sentStageIds  = DEALS_SENT_STAGES.map((s) => s.id);
    const sentRangeStartMs = Date.parse(range.start);
    const sentRangeEndMs   = Date.parse(range.end);
    const prevSentStartMs  = Date.parse(range.prevStart || '');
    const prevSentEndMs    = Date.parse(range.prevEnd   || '');

    const [currentSentRaw, prevSentRaw] = await Promise.all([
      getDealsEnteredSentStages(sentStageIds, range.start).catch(() => ({ results: [] })),
      skipPrevPeriod
        ? Promise.resolve({ results: [] })
        : getDealsEnteredSentStages(sentStageIds, range.prevStart).catch(() => ({ results: [] })),
    ]);

    const currentSentIds = (currentSentRaw.results || []).map((d) => d.id);
    const prevSentIds    = (prevSentRaw.results || []).map((d) => d.id);

    const [currentSentFull, prevSentFull] = await Promise.all([
      currentSentIds.length > 0 ? getDealsByIdsWithStageHistory(currentSentIds).catch((e) => { console.error('[metrics] dealsSent batch history error:', e.message); return []; }) : [],
      prevSentIds.length > 0 ? getDealsByIdsWithStageHistory(prevSentIds).catch(() => []) : [],
    ]);

    function filterSentDeals(dealsList, startMs, endMs) {
      const map = new Map();
      for (const d of dealsList) {
        const history = d.propertiesWithHistory?.dealstage || [];
        for (const entry of history) {
          if (!sentStageIdSet.has(entry.value)) continue;
          const enteredMs = entry.timestamp ? new Date(entry.timestamp).getTime() : NaN;
          if (!isNaN(enteredMs) && enteredMs >= startMs && enteredMs <= endMs) {
            map.set(d.id, d);
            break;
          }
        }
      }
      return { results: [...map.values()], total: map.size };
    }

    const sentStageIdSet   = new Set(sentStageIds);
    const dealsSentRaw     = filterSentDeals(currentSentFull, sentRangeStartMs, sentRangeEndMs);
    const prevDealsSentRaw = filterSentDeals(prevSentFull, prevSentStartMs, prevSentEndMs);

    const contactSourceOverride = new Map();
    if (!skipSourceOverride) {
      const contactsWithDeals = contacts.results.filter(
        (c) => (parseInt(c.properties.num_associated_deals) || 0) > 0
      );
      if (contactsWithDeals.length > 0) {
        const contactIds = contactsWithDeals.map((c) => c.id);
        const assocMap = await getContactDealAssociationsBatch(contactIds);
        const allDealIds = new Set();
        for (const ids of assocMap.values()) for (const id of ids) allDealIds.add(id);
        const dealsWithSource = await getDealsByIds(
          [...allDealIds],
          ['lead_source', 'createdate', 'dealname', 'dealstage', 'pipeline', 'amount', 'hubspot_owner_id', 'closedate']
        );
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
        var __assocMap = assocMap;
        var __dealRecordById = dealRecordById;
      }
    } else {
      const nonAnalyticsDealIds = deals.results
        .filter((d) => mapDealLeadSource(d.properties.lead_source) !== null)
        .map((d) => d.id);
      if (nonAnalyticsDealIds.length > 0) {
        console.log(`[metrics] Wide-period targeted lookup: ${nonAnalyticsDealIds.length} non-analytics deals`);
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

    const periodContactPhones = [];
    {
      const seen = new Set();
      for (const c of contacts.results) {
        for (const raw of [c.properties.phone, c.properties.mobilephone]) {
          const p = normalizePhone(raw);
          if (p && !seen.has(p)) {
            seen.add(p);
            periodContactPhones.push(p);
          }
        }
      }
    }
    const openPhoneActivity = new Map();

    const kvStoreByPhone = new Map();
    const gmailActivityByEmail = new Map();
    let partialOpenPhoneSignal = false;

    const signalCollectionPromise = (async () => {
      const allPhones = new Set();
      for (const c of contacts.results) {
        for (const p of [c.properties.phone, c.properties.mobilephone].map(normalizePhone).filter(Boolean)) {
          allPhones.add(p);
        }
      }
      const phoneArr = [...allPhones];
      if (phoneArr.length > 0) {
        console.log(`[metrics] OpenPhone KV polling ${phoneArr.length} phones for ${Math.round(periodDays)}-day period (batch=${OP_BATCH})`);
        for (let i = 0; i < phoneArr.length; i += OP_BATCH) {
          const batch = phoneArr.slice(i, i + OP_BATCH);
          const results = await Promise.all(
            batch.map((p) => getEarliestOutboundForPhone(p, range.start).catch(() => null))
          );
          for (let j = 0; j < batch.length; j++) {
            if (results[j]) kvStoreByPhone.set(batch[j], results[j]);
          }
        }
        console.log(`[metrics] OpenPhone KV: ${kvStoreByPhone.size} phones matched`);
      }

      if (GMAIL_ENABLED) {
        const ownerEmailById = {};
        for (const o of owners) {
          if (o.email) ownerEmailById[o.id] = o.email;
        }
        const gmailPairs = [];
        for (const c of contacts.results) {
          const contactEmail = (c.properties.email || '').toLowerCase();
          const repId = c.properties.hubspot_owner_id;
          const repEmail = ownerEmailById[repId];
          if (contactEmail && repEmail) {
            gmailPairs.push({ senderEmail: repEmail, recipientEmail: contactEmail });
          }
        }
        if (gmailPairs.length > 0) {
          console.log(`[metrics] Gmail polling ${gmailPairs.length} pairs for ${Math.round(periodDays)}-day period`);
          const gmailMap = await buildGmailActivityMap(gmailPairs, range.start);
          for (const [email, ts] of gmailMap) gmailActivityByEmail.set(email, ts);
          console.log(`[metrics] Gmail: ${gmailActivityByEmail.size} contacts matched`);
        }
      }
    })();

    const budgetTimer = new Promise((resolve) => setTimeout(resolve, OP_BUDGET_MS, 'timeout'));
    const signalResult = await Promise.race([signalCollectionPromise.then(() => 'done').catch(() => 'error'), budgetTimer]);
    if (signalResult === 'timeout') {
      partialOpenPhoneSignal = true;
      console.warn(`[metrics] Signal collection timed out after ${OP_BUDGET_MS}ms — OP/Gmail breach signals may be incomplete (OP=${kvStoreByPhone.size} phones, Gmail=${gmailActivityByEmail.size} contacts collected so far)`);
    } else {
      console.log(`[metrics] Signal collection complete for ${Math.round(periodDays)}-day period`);
    }

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
        const pollTs = openPhoneActivity.get(p);
        if (pollTs && (!earliest || pollTs < earliest)) earliest = pollTs;
        const kvTs = kvStoreByPhone.get(p);
        if (kvTs && (!earliest || kvTs < earliest)) earliest = kvTs;
      }
      return earliest;
    }

    // --- Summary ---
    const fbContacts = contacts.results.filter((c) => effectiveSource(c) === 'facebook');
    const prevFbContacts = prevContacts.results.filter((c) => effectiveSource(c) === 'facebook');
    const coldContacts = contacts.results.filter((c) => ['email_extension', 'cold_outreach'].includes(effectiveSource(c)));
    const prevColdContacts = prevContacts.results.filter((c) => ['email_extension', 'cold_outreach'].includes(effectiveSource(c)));
    const wonDeals = closedDeals.results.filter((d) => CLOSED_WON_STAGES.includes(d.properties.dealstage));
    const prevWonDeals = prevClosedDeals.results.filter((d) => CLOSED_WON_STAGES.includes(d.properties.dealstage));
    const revenue = wonDeals.reduce((sum, d) => sum + (parseFloat(d.properties.amount) || 0), 0);
    const prevRevenue = prevWonDeals.reduce((sum, d) => sum + (parseFloat(d.properties.amount) || 0), 0);

    const coldWonDeals = wonDeals.filter((d) => mapDealLeadSource(d.properties.lead_source) === 'cold_outreach');
    const prevColdWonDeals = prevWonDeals.filter((d) => mapDealLeadSource(d.properties.lead_source) === 'cold_outreach');
    const coldOutreachRevenue = coldWonDeals.reduce((sum, d) => sum + (parseFloat(d.properties.amount) || 0), 0);
    const prevColdOutreachRevenue = prevColdWonDeals.reduce((sum, d) => sum + (parseFloat(d.properties.amount) || 0), 0);

    function trendPct(current, previous) {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    }

    const summarysamePeriodDealsSent = (dealsSentRaw.results || []).filter(d => {
      const createMs = Date.parse(d.properties?.createdate || '');
      return createMs && createMs >= sentRangeStartMs && createMs <= sentRangeEndMs;
    }).length;

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

    // --- Funnel ---
    const REQUIRE_DEAL_SOURCES = ['email_extension', 'crm_manual', 'integration'];
    const sourceKeys = Object.keys(SOURCE_MAP);
    const leadsBySource = {};
    const dealsBySource = {};
    const wonBySource = {};
    for (const key of sourceKeys) { leadsBySource[key] = 0; dealsBySource[key] = 0; wonBySource[key] = 0; }
    let totalLeadsCohort = 0, totalDealsCohort = 0, totalWonCohort = 0;

    for (const c of contacts.results) {
      const src = effectiveSource(c);
      const numDeals = parseInt(c.properties.num_associated_deals) || 0;
      const lifecycle = (c.properties.lifecyclestage || '').toLowerCase();
      const becameDeal = numDeals > 0 || lifecycle === 'opportunity' || lifecycle === 'customer';
      const becameCustomer = lifecycle === 'customer';
      if (REQUIRE_DEAL_SOURCES.includes(src) && !becameDeal) continue;
      leadsBySource[src]++; totalLeadsCohort++;
      if (becameDeal) { dealsBySource[src]++; totalDealsCohort++; }
      if (becameCustomer) { wonBySource[src]++; totalWonCohort++; }
    }

    const activeSources = sourceKeys.filter((s) => leadsBySource[s] > 0 || dealsBySource[s] > 0 || wonBySource[s] > 0);
    const funnel = {
      sources: activeSources.map((s) => ({ key: s, label: SOURCE_MAP[s].label, color: SOURCE_MAP[s].color, leads: leadsBySource[s], deals: dealsBySource[s], won: wonBySource[s] })),
      totals: { leads: totalLeadsCohort, deals: totalDealsCohort, won: totalWonCohort },
    };

    // --- Reps ---
    const allRepIds = new Set(repIds);
    for (const d of closedDeals.results) { if (d.properties.hubspot_owner_id) allRepIds.add(d.properties.hubspot_owner_id); }

    const repBidsMap = new Map();
    for (const d of dealsSentRaw.results) {
      const repId = d.properties.hubspot_owner_id;
      if (!repId) continue;
      if (!repBidsMap.has(repId)) repBidsMap.set(repId, { bidsSent: 0, samePeriodBidsSent: 0, bidsRevenue: 0, bidTimeSumMs: 0, bidTimeCount: 0 });
      const entry = repBidsMap.get(repId);
      entry.bidsSent++;
      entry.bidsRevenue += parseFloat(d.properties.amount) || 0;
      const dealCreateMs = Date.parse(d.properties.createdate || '');
      if (dealCreateMs && dealCreateMs >= sentRangeStartMs && dealCreateMs <= sentRangeEndMs) entry.samePeriodBidsSent++;
      const createMs = Date.parse(d.properties.createdate || '');
      if (createMs) {
        const history = d.propertiesWithHistory?.dealstage || [];
        let earliestBidMs = null;
        for (const h of history) {
          if (!sentStageIdSet.has(h.value)) continue;
          const ts = h.timestamp ? new Date(h.timestamp).getTime() : NaN;
          if (!isNaN(ts) && ts >= sentRangeStartMs && ts <= sentRangeEndMs) { if (earliestBidMs === null || ts < earliestBidMs) earliestBidMs = ts; }
        }
        if (earliestBidMs !== null && earliestBidMs > createMs) { entry.bidTimeSumMs += earliestBidMs - createMs; entry.bidTimeCount++; }
      }
    }

    const ORGANIC_SOURCES = new Set(['organic', 'direct']);
    const REFERRAL_SOURCES = new Set(['referrals']);

    const reps = [];
    for (const repId of allRepIds) {
      const repContacts = contacts.results.filter((c) => c.properties.hubspot_owner_id === repId);
      const repFbContacts = repContacts.filter((c) => effectiveSource(c) === 'facebook');
      const repOrganicContacts = repContacts.filter((c) => ORGANIC_SOURCES.has(effectiveSource(c)));
      const repReferralContacts = repContacts.filter((c) => REFERRAL_SOURCES.has(effectiveSource(c)));
      const repColdContacts = repContacts.filter((c) => effectiveSource(c) === 'cold_outreach');
      const repDeals = deals.results.filter((d) => d.properties.hubspot_owner_id === repId);
      const repWon = wonDeals.filter((d) => d.properties.hubspot_owner_id === repId);
      const repRevenue = repWon.reduce((sum, d) => sum + (parseFloat(d.properties.amount) || 0), 0);

      let responseSumMs = 0, responseCount = 0;
      for (const c of repContacts) {
        const created = Date.parse(c.properties.createdate || '');
        if (!created) continue;
        const candidates = [c.properties.hs_sa_first_engagement_date, c.properties.notes_last_contacted, c.properties.notes_last_updated, c.properties.hs_last_sales_activity_timestamp, c.properties.hs_email_last_send_date, c.properties.hs_sales_email_last_replied].map((v) => Date.parse(v || '')).filter((v) => v && v >= created);
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

      let cohortDeals = 0, cohortWon = 0;
      for (const c of repContacts) {
        const numDeals = parseInt(c.properties.num_associated_deals) || 0;
        const lifecycle = (c.properties.lifecyclestage || '').toLowerCase();
        if (numDeals > 0 || lifecycle === 'opportunity' || lifecycle === 'customer') cohortDeals++;
        if (lifecycle === 'customer') cohortWon++;
      }

      const repBids = repBidsMap.get(repId) || { bidsSent: 0, samePeriodBidsSent: 0, bidsRevenue: 0, bidTimeSumMs: 0, bidTimeCount: 0 };
      const avgTimeToBidMinutes = repBids.bidTimeCount > 0 ? Math.round(repBids.bidTimeSumMs / repBids.bidTimeCount / 60000) : null;
      const repQualifiedLeads = repContacts.filter(isQualifiedLead).length;

      if (repContacts.length === 0 && repDeals.length === 0 && repWon.length === 0) continue;

      reps.push({
        id: repId, name: ownerMap[repId] || `Owner ${repId}`,
        leadsAssigned: repQualifiedLeads, contactsAssigned: repContacts.length,
        fbLeads: repFbContacts.length, organicLeads: repOrganicContacts.length,
        referralLeads: repReferralContacts.length, coldLeads: repColdContacts.length,
        dealsCreated: repDeals.length, dealsWon: repWon.length,
        cohortDeals, cohortWon, avgResponseMinutes, revenueClosed: repRevenue,
        conversionRate: repQualifiedLeads > 0 ? Math.round((repDeals.length / repQualifiedLeads) * 100) : 0,
        bidsSent: repBids.bidsSent, samePeriodBidsSent: repBids.samePeriodBidsSent,
        bidsRevenue: repBids.bidsRevenue, avgTimeToBidMinutes,
      });
    }

    // Unassigned pseudo-rep
    const unassignedContacts = contacts.results.filter((c) => !c.properties.hubspot_owner_id);
    const unassignedDealsCreated = deals.results.filter((d) => !d.properties.hubspot_owner_id);
    const unassignedDealsWon = closedDeals.results.filter((d) => !d.properties.hubspot_owner_id && CLOSED_WON_STAGES.includes(d.properties.dealstage));
    if (unassignedContacts.length > 0 || unassignedDealsCreated.length > 0 || unassignedDealsWon.length > 0) {
      reps.push({ id: '', name: 'Unassigned', leadsAssigned: unassignedContacts.length, fbLeads: 0, organicLeads: 0, referralLeads: 0, coldLeads: 0, dealsCreated: unassignedDealsCreated.length, dealsWon: unassignedDealsWon.length, cohortDeals: 0, cohortWon: 0, avgResponseMinutes: null, revenueClosed: unassignedDealsWon.reduce((s, d) => s + (parseFloat(d.properties.amount) || 0), 0), conversionRate: 0, bidsSent: 0, bidsRevenue: 0, avgTimeToBidMinutes: null });
    }
    reps.sort((a, b) => b.revenueClosed - a.revenueClosed);

    // --- Pipeline ---
    const pipeline = buildPipeline(allDeals.results, { PIPELINES, PIPELINE_STAGES, CLOSED_WON_STAGES, CLOSED_LOST_STAGES, includeClosedStages: false });

    // --- Sources ---
    const sourceCounts = {};
    for (const c of contacts.results) { const src = effectiveSource(c); sourceCounts[src] = (sourceCounts[src] || 0) + 1; }
    const dailyMap = {};
    for (const c of contacts.results) { const day = c.properties.createdate?.split('T')[0]; if (day) dailyMap[day] = (dailyMap[day] || 0) + 1; }
    const daily = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
    const sources = { breakdown: sourceCounts, daily };

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
        id: c.id, name: `${c.properties.firstname || ''} ${c.properties.lastname || ''}`.trim() || c.properties.email || 'Unknown',
        email: c.properties.email || '', source: effectiveSource(c),
        sourceRaw: c.properties.hs_analytics_source || '', sourceDetail: c.properties.hs_analytics_source_data_1 || '',
        rep: ownerMap[c.properties.hubspot_owner_id] || 'Unassigned', repId: c.properties.hubspot_owner_id || '',
        createdAt: c.properties.createdate || '', recentConversionAt: c.properties.recent_conversion_date || '',
        numConversionEvents: parseInt(c.properties.num_conversion_events) || 0, isReoptIn,
        lifecycleStage: c.properties.lifecyclestage || '', numDeals: parseInt(c.properties.num_associated_deals) || 0,
        status, hubspotUrl: process.env.HUBSPOT_PORTAL_ID ? `https://app.hubspot.com/contacts/${process.env.HUBSPOT_PORTAL_ID}/contact/${c.id}` : '',
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
    const pipelineHealthConstants = { AVG_CYCLE_DAYS, AVG_CYCLE_DEAL_COUNTS, AVG_CYCLE_GENERATED_AT, HOT_STAGES_BY_PIPELINE, STICKY_HOT_STAGES_BY_PIPELINE, DESIGN_MILESTONE_STAGE, PRE_DESIGN_STAGES, POST_DESIGN_STAGE, PIPELINES, PIPELINE_STAGES, CLOSED_WON_STAGES, CLOSED_LOST_STAGES, portalId: process.env.HUBSPOT_PORTAL_ID || null };
    const pipelineHealth = buildPipelineHealth(allDeals.results, ownerMap, pipelineHealthConstants);

    // --- Pipeline Coverage ---
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
      p.coverage = { openValue, trailing30Revenue: trailing30, ratio: trailing30 > 0 ? +(openValue / trailing30).toFixed(2) : null, target: COVERAGE_TARGET };
    }
    pipelineHealth.coverageTarget = COVERAGE_TARGET;

    // --- Stage Conversion ---
    const stageConversionByPipeline = {};
    for (const [pKey, { id: pipelineId }] of Object.entries(PIPELINES)) {
      const openStages = (PIPELINE_STAGES[pKey] || []).filter((s) => !CLOSED_WON_STAGES.includes(s.id) && !CLOSED_LOST_STAGES.includes(s.id));
      if (openStages.length === 0) { stageConversionByPipeline[pKey] = []; continue; }
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
      const wonDealsInPipeline = trailing30Closed.results.filter((d) => d.properties.pipeline === pipelineId && CLOSED_WON_STAGES.includes(d.properties.dealstage));
      const wonCount = wonDealsInPipeline.length;
      for (let i = 0; i < reached.length; i++) reached[i] += wonCount;
      const funnelStages = openStages.map((s, i) => ({ id: s.id, label: s.label, reached: reached[i], conversionToNext: null }));
      for (let i = 0; i < funnelStages.length - 1; i++) { if (reached[i] > 0) funnelStages[i].conversionToNext = Math.round((reached[i + 1] / reached[i]) * 100); }
      if (funnelStages.length > 0 && reached[reached.length - 1] > 0) funnelStages[funnelStages.length - 1].conversionToNext = Math.round((wonCount / reached[reached.length - 1]) * 100);
      funnelStages.push({ id: 'won', label: 'Won (30d)', reached: wonCount, conversionToNext: null, terminal: true });
      stageConversionByPipeline[pKey] = funnelStages;
    }
    pipelineHealth.stageConversion = stageConversionByPipeline;

    // --- Period deals ---
    const stageLabelByPipelineIdForPeriod = {};
    for (const [pKey, stages] of Object.entries(PIPELINE_STAGES)) { const pId = PIPELINES[pKey].id; stageLabelByPipelineIdForPeriod[pId] = {}; for (const s of stages) stageLabelByPipelineIdForPeriod[pId][s.id] = s.label; }
    const pipelineLabelById = {};
    for (const [k, { id, label }] of Object.entries(PIPELINES)) pipelineLabelById[id] = label;

    const periodDealsMap = new Map();
    function addPeriodDeal(d, { createdInPeriod, closedInPeriod }) {
      const props = d.properties || {};
      const existing = periodDealsMap.get(d.id);
      if (existing) { existing.createdInPeriod = existing.createdInPeriod || createdInPeriod; existing.closedInPeriod = existing.closedInPeriod || closedInPeriod; return; }
      const stageLabel = (stageLabelByPipelineIdForPeriod[props.pipeline] || {})[props.dealstage] || props.dealstage || '';
      const isWon = CLOSED_WON_STAGES.includes(props.dealstage);
      const isLost = CLOSED_LOST_STAGES.includes(props.dealstage);
      const dealSource = mapDealLeadSource(props.lead_source) || 'other';
      periodDealsMap.set(d.id, { id: d.id, name: props.dealname || 'Untitled', stage: props.dealstage || '', stageLabel, pipeline: props.pipeline || '', pipelineLabel: pipelineLabelById[props.pipeline] || '', amount: parseFloat(props.amount) || 0, ownerId: props.hubspot_owner_id || '', ownerName: ownerMap[props.hubspot_owner_id] || 'Unassigned', createdate: props.createdate || '', closedate: props.closedate || '', status: isWon ? 'won' : isLost ? 'lost' : 'open', createdInPeriod, closedInPeriod, source: dealSource, leadSourceRaw: props.lead_source || '', hubspotUrl: process.env.HUBSPOT_PORTAL_ID ? `https://app.hubspot.com/contacts/${process.env.HUBSPOT_PORTAL_ID}/deal/${d.id}` : '' });
    }
    for (const d of deals.results) addPeriodDeal(d, { createdInPeriod: true, closedInPeriod: false });
    for (const d of closedDeals.results) addPeriodDeal(d, { createdInPeriod: false, closedInPeriod: true });
    const dealsSentIds = new Set((dealsSentRaw.results || []).map((d) => d.id));
    for (const d of dealsSentRaw.results || []) addPeriodDeal(d, { createdInPeriod: false, closedInPeriod: false });
    const allPeriodDealsValues = [...periodDealsMap.values()];
    const periodDeals = allPeriodDealsValues.filter((d) => d.createdInPeriod || d.closedInPeriod);
    const dealsSentDeals = allPeriodDealsValues.filter((d) => dealsSentIds.has(d.id));

    // --- Speed-to-Lead SLA ---
    const WORKED_LEAD_STATUSES = new Set(['attempted_to_contact', 'connected', 'in_progress', 'open_deal', 'bad_timing']);
    const SLA_THRESHOLDS_MINUTES = { 'Web Form': 5, 'Phone Call / Walk-in': 5, 'Paid Social': 5, 'Referral': 60, 'Repeat Client': 60, 'Cold Reach Out': 240, 'Trade Show / Event': 60, 'Vendor Partner': null, 'Other': 60 };
    const DEFAULT_SLA_MINUTES = 5;
    let slaTotal = 0, slaWithin = 0, slaOver = 0, slaBreaching = 0, slaSafe = 0;
    const breachingLeads = [], slaWithinLeads = [], slaOverLeads = [], slaSafeLeads = [], slaResponseTimes = [];
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
      const contactSlaMinutes = sbgSource in SLA_THRESHOLDS_MINUTES ? SLA_THRESHOLDS_MINUTES[sbgSource] : DEFAULT_SLA_MINUTES;
      if (contactSlaMinutes === null) continue;
      const contactSlaCutoffMs = contactSlaMinutes * 60 * 1000;
      const slaSourceKey = sbgSource || 'Source not set';
      if (!slaBySource[slaSourceKey]) slaBySource[slaSourceKey] = { total: 0, within: 0, over: 0, breaching: 0, safe: 0, thresholdMinutes: contactSlaMinutes };

      const created = Date.parse(c.properties.createdate || '');
      if (!created) continue;
      const TOLERANCE_MS = 10 * 60 * 1000;
      const minActivityMs = created - TOLERANCE_MS;

      const candidates = [c.properties.hs_sa_first_engagement_date, c.properties.notes_last_contacted, c.properties.notes_last_updated, c.properties.hs_last_sales_activity_timestamp, c.properties.hs_email_last_send_date, c.properties.hs_sales_email_last_replied, c.properties.hs_lifecyclestage_salesqualifiedlead_date, c.properties.hs_lifecyclestage_opportunity_date, c.properties.hs_lifecyclestage_customer_date].map((v) => Date.parse(v || '')).filter((v) => v && v >= minActivityMs);
      const opTs = lookupOpenPhoneTimestamp(c);
      if (opTs && opTs >= minActivityMs) candidates.push(opTs);
      const gmailTs = lookupGmailTimestamp(c);
      if (gmailTs && gmailTs >= minActivityMs) candidates.push(gmailTs);
      if (typeof __assocMap !== 'undefined' && typeof __dealRecordById !== 'undefined') {
        const dealIds = __assocMap.get(c.id) || [];
        for (const did of dealIds) { const deal = __dealRecordById.get(did); if (!deal) continue; const dealCreatedMs = Date.parse(deal.properties.createdate || ''); if (dealCreatedMs && dealCreatedMs >= minActivityMs) candidates.push(dealCreatedMs); }
      }
      const hsResponseMs = parseInt(c.properties.hs_time_to_first_engagement) || 0;
      if (hsResponseMs > 0 && candidates.length === 0) { const engagementTs = created + hsResponseMs; if (engagementTs >= minActivityMs) candidates.push(engagementTs); }
      const workedLifecycles = ['salesqualifiedlead', 'opportunity', 'customer'];
      if (candidates.length === 0 && workedLifecycles.includes(lifecycle)) candidates.push(created + contactSlaCutoffMs + 1);
      const leadStatus = (c.properties.hs_lead_status || '').toLowerCase();
      if (candidates.length === 0 && WORKED_LEAD_STATUSES.has(leadStatus)) candidates.push(created + contactSlaCutoffMs + 1);

      slaTotal++; slaBySource[slaSourceKey].total++;
      const ageAnchorMs = isHistoricalPeriod ? periodEndMs : Date.now();
      const slaNumDeals = parseInt(c.properties.num_associated_deals) || 0;
      let slaHasWon = (c.properties.lifecyclestage || '').toLowerCase() === 'customer';
      if (!slaHasWon && slaNumDeals > 0 && typeof __assocMap !== 'undefined' && typeof __dealRecordById !== 'undefined') {
        const dealIds = __assocMap.get(c.id) || [];
        slaHasWon = dealIds.some((did) => { const deal = __dealRecordById.get(did); return deal && CLOSED_WON_STAGES.includes(deal.properties.dealstage); });
      }
      const leadInfo = { id: c.id, name: `${c.properties.firstname || ''} ${c.properties.lastname || ''}`.trim() || email || 'Unknown', email, phone: c.properties.phone || c.properties.mobilephone || '', source: effectiveSource(c), rep: ownerMap[c.properties.hubspot_owner_id] || 'Unassigned', repId: c.properties.hubspot_owner_id || '', createdAt: c.properties.createdate || '', numDeals: slaNumDeals, hasWon: slaHasWon };

      if (candidates.length === 0) {
        const ageMs = ageAnchorMs - created;
        if (ageMs > contactSlaCutoffMs) {
          slaBreaching++; slaBySource[slaSourceKey].breaching++;
          const phones = [c.properties.phone, c.properties.mobilephone].filter(Boolean);
          const opChecked = phones.length > 0 && phones.some((p) => normalizePhone(p));
          breachingLeads.push({ id: c.id, name: `${c.properties.firstname || ''} ${c.properties.lastname || ''}`.trim() || email || 'Unknown', email, phone: c.properties.phone || c.properties.mobilephone || '', source: effectiveSource(c), rep: ownerMap[c.properties.hubspot_owner_id] || 'Unassigned', repId: c.properties.hubspot_owner_id || '', createdAt: c.properties.createdate || '', numDeals: slaNumDeals, hasWon: slaHasWon, ageMinutes: Math.round(ageMs / 60000), diagnostic: { hasNotesLastContacted: !!c.properties.notes_last_contacted, hasNotesLastUpdated: !!c.properties.notes_last_updated, hasSalesActivityTs: !!c.properties.hs_last_sales_activity_timestamp, hasEmailLastSend: !!c.properties.hs_email_last_send_date, lifecycle: c.properties.lifecyclestage || '', numDeals: parseInt(c.properties.num_associated_deals) || 0, hasOpportunityDate: !!c.properties.hs_lifecyclestage_opportunity_date, hasSqlDate: !!c.properties.hs_lifecyclestage_salesqualifiedlead_date, hasOpenPhoneCheck: opChecked, openPhoneMatched: !!lookupOpenPhoneTimestamp(c), notesTimestampStale: c.properties.notes_last_contacted ? `before createdate by ${Math.round((created - Date.parse(c.properties.notes_last_contacted)) / 1000)}s` : null, createdAtRaw: c.properties.createdate, notesLastUpdatedRaw: c.properties.notes_last_updated || null, opportunityDateRaw: c.properties.hs_lifecyclestage_opportunity_date || null, leadStatus: c.properties.hs_lead_status || null } });
        } else { slaSafe++; slaBySource[slaSourceKey].safe++; slaSafeLeads.push({ ...leadInfo, ageMinutes: Math.round(ageMs / 60000) }); }
      } else {
        const firstActivity = Math.min(...candidates);
        const responseMs = firstActivity - created;
        const responseMinutes = Math.round(responseMs / 60000);
        slaResponseTimes.push(responseMinutes);
        const enrichedLead = { ...leadInfo, responseMinutes };
        if (responseMs <= contactSlaCutoffMs) { slaWithin++; slaBySource[slaSourceKey].within++; slaWithinLeads.push(enrichedLead); }
        else { slaOver++; slaBySource[slaSourceKey].over++; slaOverLeads.push(enrichedLead); }
      }
    }

    breachingLeads.sort((a, b) => b.ageMinutes - a.ageMinutes);
    const slaCompliancePct = slaTotal > 0 ? Math.round((slaWithin / slaTotal) * 100) : null;
    let medianResponseMinutes = null;
    if (slaResponseTimes.length > 0) {
      const sorted = [...slaResponseTimes].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      medianResponseMinutes = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }
    const sourceBreakdown = Object.entries(slaBySource).map(([source, s]) => ({ source, thresholdMinutes: s.thresholdMinutes, total: s.total, within: s.within, over: s.over, breaching: s.breaching, safe: s.safe, compliancePct: s.total > 0 ? Math.round((s.within / s.total) * 100) : null })).sort((a, b) => b.total - a.total);

    const sla = { thresholdMinutes: DEFAULT_SLA_MINUTES, sourceAware: true, isHistorical: isHistoricalPeriod, partialOpenPhoneSignal, sourceBreakdown, total: slaTotal, within: slaWithin, over: slaOver, breaching: slaBreaching, safe: slaSafe, compliancePct: slaCompliancePct, medianResponseMinutes, breachingLeads: breachingLeads.slice(0, 75).map(({ diagnostic: _d, ...l }) => l), breachingTotal: breachingLeads.length, breachingDeals: breachingLeads.filter((l) => l.numDeals > 0).length, breachingWon: breachingLeads.filter((l) => l.hasWon).length, withinLeads: slaWithinLeads.sort((a, b) => a.responseMinutes - b.responseMinutes).slice(0, 75), withinDeals: slaWithinLeads.filter((l) => l.numDeals > 0).length, withinWon: slaWithinLeads.filter((l) => l.hasWon).length, overLeads: slaOverLeads.sort((a, b) => b.responseMinutes - a.responseMinutes).slice(0, 75), overDeals: slaOverLeads.filter((l) => l.numDeals > 0).length, overWon: slaOverLeads.filter((l) => l.hasWon).length, safeLeads: slaSafeLeads.slice(0, 75), safeDeals: slaSafeLeads.filter((l) => l.numDeals > 0).length, safeWon: slaSafeLeads.filter((l) => l.hasWon).length };

    // --- Cohort deals ---
    const stageLabelByPipelineId = {};
    for (const [pKey, stages] of Object.entries(PIPELINE_STAGES)) { const pId = PIPELINES[pKey].id; stageLabelByPipelineId[pId] = {}; for (const s of stages) stageLabelByPipelineId[pId][s.id] = s.label; }
    const cohortDeals = [];
    if (typeof __assocMap !== 'undefined' && typeof __dealRecordById !== 'undefined') {
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
          cohortDeals.push({ id: d.id, name: props.dealname || 'Untitled', stage: props.dealstage || '', stageLabel, pipeline: props.pipeline || '', pipelineLabel: (PIPELINES[Object.keys(PIPELINES).find((k) => PIPELINES[k].id === props.pipeline)] || {}).label || '', amount: parseFloat(props.amount) || 0, ownerId: props.hubspot_owner_id || '', ownerName: ownerMap[props.hubspot_owner_id] || 'Unassigned', createdate: props.createdate || '', closedate: props.closedate || '', status: isWon ? 'won' : isLost ? 'lost' : 'open', contactId, contactSource, contactRepId, hubspotUrl: process.env.HUBSPOT_PORTAL_ID ? `https://app.hubspot.com/contacts/${process.env.HUBSPOT_PORTAL_ID}/deal/${d.id}` : '' });
        }
      }
    }

    // --- Activity funnel by source ---
    const sourceActivityAgg = {};
    for (const key of sourceKeys) sourceActivityAgg[key] = { leads: 0, created: 0, won: 0, lost: 0, wonValue: 0, totalValue: 0 };
    for (const key of sourceKeys) sourceActivityAgg[key].leads = leadsBySource[key] || 0;
    const dealIdToContactSource = new Map();
    for (const cd of cohortDeals) { if (cd.contactSource && cd.contactSource !== 'other') dealIdToContactSource.set(cd.id, cd.contactSource); }
    for (const d of periodDeals) {
      let src = d.source;
      if (!src || src === 'other') { const fallback = dealIdToContactSource.get(d.id); if (fallback) src = fallback; }
      const bucket = sourceActivityAgg[src] || sourceActivityAgg.other;
      if (d.createdInPeriod) { bucket.created++; bucket.totalValue += d.amount; }
      if (d.closedInPeriod) { if (d.status === 'won') { bucket.won++; bucket.wonValue += d.amount; } else if (d.status === 'lost') { bucket.lost++; } }
    }

    const repeatClientOriginalSources = {};
    for (const d of periodDeals) {
      const effectiveSrc = (!d.source || d.source === 'other') ? (dealIdToContactSource.get(d.id) || null) : d.source;
      if (effectiveSrc !== 'repeat_client') continue;
      const originalSrc = dealIdToContactSource.get(d.id) || 'unknown';
      if (originalSrc === 'repeat_client') continue;
      repeatClientOriginalSources[originalSrc] = (repeatClientOriginalSources[originalSrc] || 0) + 1;
    }

    const funnelActivity = {
      sources: Object.entries(sourceActivityAgg).filter(([, a]) => a.leads > 0 || a.created > 0 || a.won > 0).map(([key, a]) => {
        const decided = a.won + a.lost;
        const entry = { key, label: SOURCE_MAP[key].label, color: SOURCE_MAP[key].color, leads: a.leads, deals: a.created, won: a.won, revenue: a.wonValue, avgDealSize: a.won > 0 ? Math.round(a.wonValue / a.won) : 0, winRate: decided > 0 ? Math.round((a.won / decided) * 100) : null, pipelineValue: a.totalValue };
        if (key === 'repeat_client' && Object.keys(repeatClientOriginalSources).length > 0) entry.originalSources = repeatClientOriginalSources;
        return entry;
      }),
      totals: { leads: Object.values(sourceActivityAgg).reduce((s, a) => s + a.leads, 0), deals: Object.values(sourceActivityAgg).reduce((s, a) => s + a.created, 0), won: Object.values(sourceActivityAgg).reduce((s, a) => s + a.won, 0) },
    };

    // --- Enrich reps ---
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

    // --- Enrich funnel sources ---
    const sourceAgg = {};
    for (const s of funnel.sources) sourceAgg[s.key] = { won: 0, lost: 0, wonValue: 0, totalValue: 0 };
    for (const d of cohortDeals) { const bucket = sourceAgg[d.contactSource]; if (!bucket) continue; bucket.totalValue += d.amount; if (d.status === 'won') { bucket.won++; bucket.wonValue += d.amount; } else if (d.status === 'lost') { bucket.lost++; } }
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

    const pipelineHealthSlim = includeDrillDown ? pipelineHealth : { ...pipelineHealth, byPipeline: Object.fromEntries(Object.entries(pipelineHealth.byPipeline).map(([k, v]) => [k, { ...v, buckets: { hot: [], active: [], aging: [], cold: [] } }])) };

    const responsePayload = {
      period: { start: range.start, end: range.end, label: range.label },
      summary, funnel, funnelActivity, reps,
      pipeline: includeDrillDown ? pipeline : Object.fromEntries(Object.entries(pipeline).map(([k, v]) => [k, { ...v, stages: v.stages.map(s => ({ id: s.id, label: s.label, count: s.count, value: s.value, deals: [] })), dealList: [], staleList: [] }])),
      pipelineHealth: pipelineHealthSlim, sources,
      leads: includeDrillDown ? (skipSourceOverride ? [] : leads) : [],
      leadsOmitted: !includeDrillDown || skipSourceOverride,
      leadCounts,
      cohortDeals: includeDrillDown ? cohortDeals : [],
      periodDeals: includeDrillDown ? periodDeals : [],
      dealsSentDeals: includeDrillDown ? dealsSentDeals : [],
      sla: includeDrillDown ? sla : { ...sla, breachingLeads: [], withinLeads: [], overLeads: [], safeLeads: [] },
    };
    const cacheTTL = isPeriodClosed && periodDays >= 28 ? 3600 : periodDays > 30 ? 1800 : 900;
    await setCached(cacheKey, responsePayload, cacheTTL);
    return res.status(200).json(responsePayload);
  } catch (err) {
    console.error('Metrics API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
