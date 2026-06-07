import { getContactsInRange, getDealsInRange, getDealsClosedInRange, getAllOpenDeals, getOwners, getContactDealAssociationsBatch, getDealsByIds, getDealsEnteredSentStages, getDealsByIdsWithStageHistory } from './_lib/sales/hubspot.js';
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
    const { period = 'today', start: customStart, end: customEnd, nocache } = req.query;
    const forceRefresh = nocache === '1';
    const range = getDateRange(period, customStart, customEnd);

    // 60-second response cache. Keyed by period+range so different views don't
    // collide. Only caches successful 200 responses (errors fall through).
    // v17 = cold outreach revenue + per-rep bids / lead-to-bid time
    const cacheKey = `metricsv17:${period}:${customStart || ''}:${customEnd || ''}`;
    // CDN cache header — Vercel's edge network will serve this response in
    // <50ms worldwide once cached. Set early so it applies to every 200 path.
    // s-maxage=120: CDN freshness window (matches cron interval).
    // stale-while-revalidate=600: serve stale up to 10 min while CDN revalidates.
    // nocache=1 (manual refresh): skip CDN and KV caches entirely.
    if (forceRefresh) {
      res.setHeader('Cache-Control', 'no-store');
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
    // A "historical" period ended more than 1 hour ago. Used by the SLA age anchor
    // (ageAnchorMs) and the UI label — no longer used to skip OP/Gmail polling.
    const isHistoricalPeriod = Date.now() - periodEndMs > 60 * 60 * 1000;
    const skipSourceOverride = periodDays > 14;
    // For Q1/Q2/Q3/Q4/year (>30 days), skip fetching the previous period entirely.
    // The prev period would also be 90+ days with just as many contacts/deals, adding
    // 3 more large paginated queries on top of the current period's already-large fetch.
    // Trend percentages are set to null for these wide periods instead.
    const skipPrevPeriod = periodDays > 30;
    // Signal-collection budget: OP/Gmail always runs but is capped at this wall-clock limit.
    // If it times out, partialOpenPhoneSignal is set and the UI shows a "partial data" badge.
    // vercel.json sets maxDuration: 300 (5 min) for all API functions, so 30s is well within
    // the function timeout and the budget fires before Vercel kills the request.
    // Set OPENPHONE_BUDGET_MS env var to tune (default 30s).
    const OP_BUDGET_MS = parseInt(process.env.OPENPHONE_BUDGET_MS || '30000');
    // KV batch size for phone lookups. Historical/wide periods can safely bump this
    // (Redis reads are fast). Set OPENPHONE_CONCURRENCY env var to override.
    const OP_BATCH = parseInt(process.env.OPENPHONE_CONCURRENCY || '50');
    if (skipSourceOverride) console.log(`[metrics] Skipping source override for ${Math.round(periodDays)}-day period`);
    if (skipPrevPeriod) console.log(`[metrics] Skipping prev-period fetches for ${Math.round(periodDays)}-day period`);

    // Trailing 30-day window for pipeline coverage ratio
    const now30 = new Date();
    const trailing30Start = new Date(now30.getTime() - 30 * 86400000).toISOString();
    const trailing30End = now30.toISOString();

    // getAllOpenDeals is period-independent (same result for every period).
    // Cache it under its own short-TTL key so multiple periods in the same
    // 10-minute window reuse one fetch instead of each triggering the full
    // paginated query (the single biggest cold-cache bottleneck).
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

    // trailing30Closed is also period-independent — same data regardless of whether
    // the user is viewing Q1, Q2, Q3, or Q4. Cache it separately so every period
    // that hits cold doesn't re-fetch the same 30-day window.
    const trailing30DateKey = trailing30Start.split('T')[0]; // changes once per day
    const TRAILING30_CACHE_KEY = `trailing30closed:v1:${trailing30DateKey}`;
    let trailing30Closed = await getCached(TRAILING30_CACHE_KEY);
    if (!trailing30Closed) {
      trailing30Closed = await getDealsClosedInRange(trailing30Start, trailing30End).catch(() => ({ results: [], total: 0 }));
      await setCached(TRAILING30_CACHE_KEY, trailing30Closed, 600);
    } else {
      console.log('[metrics] trailing30Closed cache HIT');
    }

    // Run remaining HubSpot fetches in parallel. Wrap each in .catch() so a
    // single HubSpot 429/error doesn't kill the entire response — we return
    // partial data rather than a 500.
    // Prev-period fetches are skipped for wide windows (>30 days) — they'd be
    // just as large as the current period and add 3 extra paginated queries for
    // negligible value (trend arrows on a Q1 view nobody compares to Q4).
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

    // --- Deals Sent: two-step fetch ---
    // HubSpot Search API does NOT return hs_date_entered_* properties even when
    // explicitly requested — they are internal computed properties only accessible
    // via the batch read endpoint (/crm/v3/objects/deals/batch/read).
    // Step 1: search to get candidate deal IDs (deals modified since period start,
    //         since a stage move always updates hs_lastmodifieddate).
    // Step 2: batch-read those IDs with hs_date_entered_* so we get real values.
    // Step 3: filter in-memory for entries within the period window.
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

    // Batch-read with propertiesWithHistory so we can check whether a deal
    // entered a sent stage during the period — even if it has since moved on.
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

    // --- Source override from associated deals ---
    // For each contact with at least one associated deal, look up the deal's
    // custom `lead_source` property and use it to override the contact's source
    // classification. Skipped for wide periods — too many contacts.
    const contactSourceOverride = new Map(); // contactId → source key
    const contactsWithDeals = skipSourceOverride ? [] : contacts.results.filter(
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
        // Pick the most-recent associated deal that has a mapped source
        let best = null;
        for (const did of dealIds) {
          const entry = dealLeadSource.get(did);
          if (!entry) continue;
          if (!best || entry.createdate > best.createdate) best = entry;
        }
        if (best) contactSourceOverride.set(contactId, best.source);
      }
      // Stash for cohort deals enrichment below
      var __assocMap = assocMap;
      var __dealRecordById = dealRecordById;
    }

    function effectiveSource(contact) {
      return (
        contactSourceOverride.get(contact.id) ||
        classifySource(contact.properties.hs_analytics_source, contact.properties.hs_analytics_source_data_1)
      );
    }

    const ownerMap = {};
    for (const o of owners) {
      ownerMap[o.id] = `${o.firstName || ''} ${o.lastName || ''}`.trim() || o.email;
    }

    // --- OpenPhone activity map ---
    // OpenPhone /v1/calls and /v1/messages require participants. Build the
    // list from this period's contact phone numbers, then query OpenPhone.
    // Limitation: only catches activity for contacts present in this period —
    // if a rep called an existing customer who isn't in the current period
    // window, that call won't be reflected here.
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
    // OpenPhone polling is skipped entirely — it was O(phones × workspace_numbers × 2)
    // serial API calls at 200ms each, causing timeouts for any period with >20 contacts.
    // The KV webhook store (kvStoreByPhone below) provides the same data from real-time
    // webhooks and is orders of magnitude faster (Redis reads vs API calls).
    const openPhoneActivity = new Map();

    // --- OpenPhone + Gmail signal collection ---
    // Always runs regardless of period width or age. A lead genuinely called via
    // OpenPhone but never logged to HubSpot would otherwise appear as breaching
    // on any historical or wide view.
    //
    // Both sources run inside a shared Promise.race against OP_BUDGET_MS (default 30s).
    // If the budget is exceeded we move on with whatever was collected and set
    // partialOpenPhoneSignal = true so the UI can surface a "partial data" badge.
    const kvStoreByPhone = new Map();
    const gmailActivityByEmail = new Map();
    let partialOpenPhoneSignal = false;

    const signalCollectionPromise = (async () => {
      // KV-store phone lookups (Redis reads — fast, ~1-5ms each)
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

      // Gmail polling (2 API calls per contact pair at concurrency 5)
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
        // Polling-based activity map (existing)
        const pollTs = openPhoneActivity.get(p);
        if (pollTs && (!earliest || pollTs < earliest)) earliest = pollTs;
        // KV webhook-populated store (new, catches texts + cold-caller matches)
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

    const summary = {
      totalLeads: contacts.total,
      facebookLeads: fbContacts.length,
      coldOutreachLeads: coldContacts.length,
      dealsWon: wonDeals.length,
      dealsSent: dealsSentRaw.results.length,
      dealsCreated: deals.results.length,
      revenueClosed: revenue,
      coldOutreachRevenue,
      trends: {
        totalLeads: trendPct(contacts.total, prevContacts.total),
        facebookLeads: trendPct(fbContacts.length, prevFbContacts.length),
        coldOutreachLeads: trendPct(coldContacts.length, prevColdContacts.length),
        dealsWon: trendPct(wonDeals.length, prevWonDeals.length),
        dealsSent: trendPct(dealsSentRaw.results.length, prevDealsSentRaw.results.length),
        dealsCreated: trendPct(deals.results.length, prevDeals.results.length),
        revenueClosed: trendPct(revenue, prevRevenue),
        coldOutreachRevenue: trendPct(coldOutreachRevenue, prevColdOutreachRevenue),
      },
    };

    // --- Collect rep IDs (needed by funnel + reps sections) ---
    const repIds = new Set();
    for (const c of contacts.results) {
      if (c.properties.hubspot_owner_id) repIds.add(c.properties.hubspot_owner_id);
    }
    for (const d of deals.results) {
      if (d.properties.hubspot_owner_id) repIds.add(d.properties.hubspot_owner_id);
    }

    // --- Funnel (TRUE COHORT, per source) ---
    //
    // For each contact created in the period, trace it through HubSpot's lifecycle:
    //   - Lead row: contact created in period
    //   - Deal row: that contact has num_associated_deals > 0 OR lifecycle is opportunity/customer
    //                (means "this lead became a deal at some point")
    //   - Won row:  contact's lifecycle is 'customer' (means "this lead's deal eventually won")
    //
    // This is a real cohort funnel — the same set of leads is traced through 3 stages.
    // The numbers in row 2/3 will always be ≤ row 1 because they're filtered subsets of the same cohort.
    // No extra HubSpot API calls needed — we already pulled num_associated_deals and lifecyclestage on contacts.
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

      // Manual-entry sources only count if they're qualified (have deal/opportunity status).
      // This avoids inflating lead counts from CRM data entry that never went anywhere.
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

    // Filter to only sources that have any activity in the cohort
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
    // Include reps from contacts, deals created, AND deals closed in range
    const allRepIds = new Set(repIds);
    for (const d of closedDeals.results) {
      if (d.properties.hubspot_owner_id) allRepIds.add(d.properties.hubspot_owner_id);
    }

    // --- Per-rep bids data ---
    // Built from dealsSentRaw which already carries full stage history (propertiesWithHistory.dealstage).
    // For each deal that entered a bid-sent stage in the period, record: count, revenue, and the
    // time delta from deal createdate → first bid-sent stage entry (for avg lead-to-bid time).
    const repBidsMap = new Map(); // repId → { bidsSent, bidsRevenue, bidTimeSumMs, bidTimeCount }
    for (const d of dealsSentRaw.results) {
      const repId = d.properties.hubspot_owner_id;
      if (!repId) continue;
      if (!repBidsMap.has(repId)) {
        repBidsMap.set(repId, { bidsSent: 0, bidsRevenue: 0, bidTimeSumMs: 0, bidTimeCount: 0 });
      }
      const entry = repBidsMap.get(repId);
      entry.bidsSent++;
      entry.bidsRevenue += parseFloat(d.properties.amount) || 0;

      // Find the earliest bid-sent stage entry within the period to compute lead→bid time
      const createMs = Date.parse(d.properties.createdate || '');
      if (createMs) {
        const history = d.propertiesWithHistory?.dealstage || [];
        let earliestBidMs = null;
        for (const h of history) {
          if (!sentStageIdSet.has(h.value)) continue;
          const ts = h.timestamp ? new Date(h.timestamp).getTime() : NaN;
          if (!isNaN(ts) && ts >= sentRangeStartMs && ts <= sentRangeEndMs) {
            if (earliestBidMs === null || ts < earliestBidMs) earliestBidMs = ts;
          }
        }
        if (earliestBidMs !== null && earliestBidMs > createMs) {
          entry.bidTimeSumMs += earliestBidMs - createMs;
          entry.bidTimeCount++;
        }
      }
    }

    // Source buckets used to break down rep leads by origin (FB/Meta vs organic-inbound)
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

      // Average lead response time = mean of (firstActivity - createdate) across
      // this rep's contacts. "First activity" uses the earliest of multiple HubSpot
      // signals to catch Gmail/Outlook plugin emails, mobile-logged calls, sequences,
      // etc — not just notes manually logged in HubSpot.
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

      // Cohort funnel for this rep: of the contacts assigned to them in this period,
      // how many became deals at any point, and how many became customers (closed-won).
      // Uses HubSpot lifecycle stage + num_associated_deals — no extra API calls.
      let cohortDeals = 0;
      let cohortWon = 0;
      for (const c of repContacts) {
        const numDeals = parseInt(c.properties.num_associated_deals) || 0;
        const lifecycle = (c.properties.lifecyclestage || '').toLowerCase();
        if (numDeals > 0 || lifecycle === 'opportunity' || lifecycle === 'customer') cohortDeals++;
        if (lifecycle === 'customer') cohortWon++;
      }

      const repBids = repBidsMap.get(repId) || { bidsSent: 0, bidsRevenue: 0, bidTimeSumMs: 0, bidTimeCount: 0 };
      const avgTimeToBidMinutes = repBids.bidTimeCount > 0
        ? Math.round(repBids.bidTimeSumMs / repBids.bidTimeCount / 60000)
        : null;

      // Skip reps with zero activity across all columns
      if (repContacts.length === 0 && repDeals.length === 0 && repWon.length === 0) continue;

      reps.push({
        id: repId,
        name: ownerMap[repId] || `Owner ${repId}`,
        leadsAssigned: repContacts.length,
        fbLeads: repFbContacts.length,
        organicLeads: repOrganicContacts.length,  // organic + direct
        referralLeads: repReferralContacts.length,
        coldLeads: repColdContacts.length,
        dealsCreated: repDeals.length,    // activity: deals CREATED in period (not necessarily from period's leads)
        dealsWon: repWon.length,           // activity: deals WON in period
        cohortDeals,                       // cohort funnel: of period's leads, how many became deals (ever)
        cohortWon,                         // cohort funnel: of period's leads, how many became customers (ever)
        avgResponseMinutes,                // mean minutes from contact created → first contacted
        revenueClosed: repRevenue,
        conversionRate: repContacts.length > 0 ? Math.round((repDeals.length / repContacts.length) * 100) : 0,
        bidsSent: repBids.bidsSent,
        bidsRevenue: repBids.bidsRevenue,
        avgTimeToBidMinutes,
      });
    }

    // Add an "Unassigned" pseudo-rep so deals without hubspot_owner_id
    // don't silently drop out of the rep totals.
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

      // Use num_open_deals to distinguish contacts with only closed-lost deals
      // from those with active or won deals. Try both property name variants;
      // if neither is populated fall back to total deal count so existing
      // behaviour is preserved rather than silently dropping qualified contacts.
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

    // --- Pipeline Health (new) ---
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
    // Coverage = open pipeline value ÷ trailing-30-day closed-won revenue.
    // Healthy ≥ 3× (you have 3x your monthly run-rate already in flight).
    // Computed per-pipeline since cycles differ wildly.
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
    const COVERAGE_TARGET = 3; // industry standard
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
    // For each pipeline, count "reached" deals at each open stage, treating
    // a deal at stage N as having reached stages 0..N. Won deals (last 30d) are
    // treated as having reached every open stage AND the terminal Won stage.
    // Conversion[i → i+1] = reached[i+1] ÷ reached[i].
    //
    // This is a snapshot view, not a strict cohort — but it surfaces bottlenecks
    // (e.g. "90% reach Bid Presented but only 30% reach Negotiation").
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

      // Open deals: contribute to their stage and all earlier ones
      for (const d of allDeals.results) {
        const props = d.properties;
        if (props.pipeline !== pipelineId) continue;
        const idx = stageIndex[props.dealstage];
        if (idx == null) continue;
        for (let i = 0; i <= idx; i++) reached[i]++;
      }

      // Won deals (trailing 30d): "passed through" every open stage
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
      // Conversion between consecutive open stages
      for (let i = 0; i < funnelStages.length - 1; i++) {
        if (reached[i] > 0) {
          funnelStages[i].conversionToNext = Math.round((reached[i + 1] / reached[i]) * 100);
        }
      }
      // Append terminal "Won" stage and conversion from last open stage to won
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
    // Union of deals created OR closed in the period, enriched with stage label
    // and deal-owner info. Used by DealDetail when the user clicks a count in
    // the "By Rep — Activity" view (which counts deals by deal owner, not by
    // contact owner — different from the cohort funnel).
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
      // Deal's own lead_source (custom HubSpot property, set by reps) — maps
      // to our SOURCE_MAP keys. Catches repeat clients / walk-ins / etc.
      // that wouldn't have a traditional analytics source.
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
    // Enrich dealsSent deals so they can be drilled into from the metric card.
    // These are deals that ENTERED the proposal stage in the period — they may have
    // been created in a prior period, so they live outside the normal periodDeals set.
    const dealsSentIds = new Set((dealsSentRaw.results || []).map((d) => d.id));
    for (const d of dealsSentRaw.results || []) addPeriodDeal(d, { createdInPeriod: false, closedInPeriod: false });
    const allPeriodDealsValues = [...periodDealsMap.values()];
    const periodDeals = allPeriodDealsValues.filter((d) => d.createdInPeriod || d.closedInPeriod);
    const dealsSentDeals = allPeriodDealsValues.filter((d) => dealsSentIds.has(d.id));

    // --- Speed-to-Lead SLA ---
    // For each contact in the period, find the earliest activity timestamp.
    // Bucket as: respondedInSLA, respondedOverSLA, breachingNow, safeUncontacted.
    // "Breaching" = uncontacted AND older than SLA. These are the urgent action items.

    // Lead statuses that prove a rep manually worked the record.
    // "new" is excluded — it is the default state and requires no rep action.
    // "unqualified" is excluded — those contacts are already skipped above.
    // "open" is intentionally excluded — HubSpot workflows can set it automatically.
    const WORKED_LEAD_STATUSES = new Set([
      'attempted_to_contact', 'connected',
      'in_progress', 'open_deal', 'bad_timing',
    ]);

    // Source-aware thresholds. Keys match c.properties.sbg_lead_source values exactly.
    // null threshold = Vendor Partner — excluded from slaTotal entirely.
    // DEFAULT_SLA_MINUTES applies when sbg_lead_source is unset (Option A: keep at 5-min
    // until the field is populated on most contacts, then revisit).
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
    const slaResponseTimes = []; // for median calc
    // Per-source accumulators for the breakdown table
    const slaBySource = {};

    for (const c of contacts.results) {
      // Only count "real" leads — skip internal/manual-entry-only contacts
      const lifecycle = (c.properties.lifecyclestage || '').toLowerCase();
      const sourceDetail = (c.properties.hs_analytics_source_data_1 || '').toUpperCase();
      const sourceRaw = (c.properties.hs_analytics_source || '').toUpperCase();
      const isManualEntry = ['EXTENSION', 'CRM_UI', 'API'].includes(sourceDetail) || ['EXTENSION', 'CRM_UI', 'API'].includes(sourceRaw);
      const numDeals = parseInt(c.properties.num_associated_deals) || 0;
      const becameDeal = numDeals > 0 || lifecycle === 'opportunity' || lifecycle === 'customer';
      // Skip pure manual entries that never became deals (CRM data entry, not real leads)
      if (isManualEntry && !becameDeal) continue;
      // Skip contacts explicitly marked unqualified — they've been evaluated and dismissed
      // Note: 'unqualified' is NOT a HubSpot lifecycle stage; UNQUALIFIED lives on hs_lead_status
      const leadStatusUpper = (c.properties.hs_lead_status || '').toUpperCase();
      if (leadStatusUpper === 'UNQUALIFIED') continue;
      // Skip internal contacts
      const email = (c.properties.email || '').toLowerCase();
      const domain = email.split('@')[1] || '';
      if (['signsbyghouston.com', 'signsbyghouston.net'].includes(domain)) continue;

      // Per-contact SLA threshold from sbg_lead_source custom field.
      // Falls back to DEFAULT_SLA_MINUTES (5) when the field is unset.
      const sbgSource = c.properties.sbg_lead_source || null;
      const contactSlaMinutes = sbgSource in SLA_THRESHOLDS_MINUTES
        ? SLA_THRESHOLDS_MINUTES[sbgSource]
        : DEFAULT_SLA_MINUTES;
      if (contactSlaMinutes === null) continue; // Vendor Partner — no SLA, skip entirely
      const contactSlaCutoffMs = contactSlaMinutes * 60 * 1000;
      const slaSourceKey = sbgSource || 'Source not set';
      if (!slaBySource[slaSourceKey]) {
        slaBySource[slaSourceKey] = { total: 0, within: 0, over: 0, breaching: 0, safe: 0, thresholdMinutes: contactSlaMinutes };
      }

      const created = Date.parse(c.properties.createdate || '');
      if (!created) continue;

      // 10-minute tolerance: activity timestamps within 10 min BEFORE createdate
      // are accepted. Handles the common "log a call → contact created from call"
      // flow where the activity timestamp predates the contact record by seconds.
      const TOLERANCE_MS = 10 * 60 * 1000;
      const minActivityMs = created - TOLERANCE_MS;

      // HubSpot's own first-engagement date is the gold standard — it includes
      // task completion, calls, emails, meetings, and chat. Use it as the
      // PRIMARY signal. All others are fallbacks for contacts where the
      // assigned owner hasn't engaged yet but someone else touched the record.
      const candidates = [
        c.properties.hs_sa_first_engagement_date,   // ★ includes tasks, calls, emails, meetings
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

      // OpenPhone outbound activity (calls/messages not logged to HubSpot)
      const opTs = lookupOpenPhoneTimestamp(c);
      if (opTs && opTs >= minActivityMs) candidates.push(opTs);

      // Gmail sent email (catches emails sent without HubSpot Sales extension)
      const gmailTs = lookupGmailTimestamp(c);
      if (gmailTs && gmailTs >= minActivityMs) candidates.push(gmailTs);

      // Associated deal createdate = rep worked the lead
      if (typeof __assocMap !== 'undefined' && typeof __dealRecordById !== 'undefined') {
        const dealIds = __assocMap.get(c.id) || [];
        for (const did of dealIds) {
          const deal = __dealRecordById.get(did);
          if (!deal) continue;
          const dealCreatedMs = Date.parse(deal.properties.createdate || '');
          if (dealCreatedMs && dealCreatedMs >= minActivityMs) candidates.push(dealCreatedMs);
        }
      }

      // Bonus: if HubSpot already computed a response time, use it as a
      // cross-check. hs_time_to_first_engagement is in ms and includes tasks.
      // If it exists but hs_sa_first_engagement_date wasn't captured above
      // (rare edge case), compute the timestamp from it.
      const hsResponseMs = parseInt(c.properties.hs_time_to_first_engagement) || 0;
      if (hsResponseMs > 0 && candidates.length === 0) {
        const engagementTs = created + hsResponseMs;
        if (engagementTs >= minActivityMs) candidates.push(engagementTs);
      }

      // Lifecycle-stage safety net: if the contact reached SQL, Opportunity, or Customer
      // stage but HubSpot didn't populate the stage-entry date (common when stages are
      // set manually), we know a rep engaged with them. Treat as contacted over SLA
      // rather than falsely flagging as "breaching now".
      const workedLifecycles = ['salesqualifiedlead', 'opportunity', 'customer'];
      if (candidates.length === 0 && workedLifecycles.includes(lifecycle)) {
        candidates.push(created + contactSlaCutoffMs + 1); // over SLA, but not breaching
      }

      // Lead-status safety net: if a rep manually set the lead status to a
      // "working" value (e.g. "connected", "attempted_to_contact") that proves they touched
      // the record, treat as contacted over SLA. This covers the gap where a rep
      // sets status + creates a task but HubSpot hasn't logged a formal engagement
      // yet (tasks only update hs_sa_first_engagement_date when *completed*).
      const leadStatus = (c.properties.hs_lead_status || '').toLowerCase();
      if (candidates.length === 0 && WORKED_LEAD_STATUSES.has(leadStatus)) {
        candidates.push(created + contactSlaCutoffMs + 1); // over SLA, but not breaching
      }

      slaTotal++;
      slaBySource[slaSourceKey].total++;
      // For historical periods, anchor age to when the period ended — not "now".
      // Without this, a Q1 2025 lead shows ageMinutes ≈ 480,000 and label "call these now".
      const ageAnchorMs = isHistoricalPeriod ? periodEndMs : Date.now();

      // Deal / won signals for close-rate hypothesis tracking
      const slaNumDeals = parseInt(c.properties.num_associated_deals) || 0;
      let slaHasWon = (c.properties.lifecyclestage || '').toLowerCase() === 'customer';
      if (!slaHasWon && slaNumDeals > 0 && typeof __assocMap !== 'undefined' && typeof __dealRecordById !== 'undefined') {
        const dealIds = __assocMap.get(c.id) || [];
        slaHasWon = dealIds.some((did) => {
          const deal = __dealRecordById.get(did);
          return deal && CLOSED_WON_STAGES.includes(deal.properties.dealstage);
        });
      }

      // Build a minimal lead-info object once, used by all SLA buckets
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
        // Uncontacted — check if breaching
        const ageMs = ageAnchorMs - created;
        if (ageMs > contactSlaCutoffMs) {
          slaBreaching++;
          slaBySource[slaSourceKey].breaching++;
          // Diagnostic: which signals are present at all (helps audit false positives)
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
            // Diagnostic flags so the user can audit why this is breaching
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
              // Raw timestamps for debugging
              createdAtRaw: c.properties.createdate,
              notesLastUpdatedRaw: c.properties.notes_last_updated || null,
              opportunityDateRaw: c.properties.hs_lifecyclestage_opportunity_date || null,
              leadStatus: c.properties.hs_lead_status || null,
            },
          });
        } else {
          slaSafe++;
          slaBySource[slaSourceKey].safe++;
          slaSafeLeads.push({ ...leadInfo, ageMinutes: Math.round(ageMs / 60000) }); // ageMs uses ageAnchorMs
        }
      } else {
        // Contacted — within or over SLA
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

    // Sort breaching leads by age desc (oldest first — most urgent)
    breachingLeads.sort((a, b) => b.ageMinutes - a.ageMinutes);

    // Current compliance = contacts-within ÷ total contacts (equal-weight per lead).
    // TODO: replace with deal-weighted compliance once sbg_lead_source is populated on
    // most contacts (target: "Source not set" row < 20% of total in the breakdown table).
    // Deal-weighted formula: sum(deal_value * withinSLA) / sum(deal_value) — a missed
    // $18K referral should count more than a missed $200 FB lead ad. Revisit when the
    // source breakdown data is meaningful enough to reflect the actual lead mix.
    const slaCompliancePct = slaTotal > 0
      ? Math.round((slaWithin / slaTotal) * 100)
      : null;

    // Median is more representative than mean when there are outliers
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

    // --- Cohort deals (deals belonging to in-period contacts) ---
    // Used by the DealDetail panel when user clicks a Deals/Won count in the funnel.
    // Each deal is enriched with the contact's effective source and rep so the
    // frontend can filter by funnel cell. Builds a stage label map first.
    const stageLabelByPipelineId = {};
    for (const [pKey, stages] of Object.entries(PIPELINE_STAGES)) {
      const pId = PIPELINES[pKey].id;
      stageLabelByPipelineId[pId] = {};
      for (const s of stages) stageLabelByPipelineId[pId][s.id] = s.label;
    }
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
    // Aggregates periodDeals by the deal's own lead_source (mapped).
    // This correctly attributes repeat clients, walk-ins, and other
    // non-traditional sources because we use the deal's own record,
    // not its contact's analytics source. So a deal that closes in April
    // for a repeat customer from January shows up under "repeat_client".
    const sourceActivityAgg = {};
    for (const key of sourceKeys) {
      sourceActivityAgg[key] = { leads: 0, created: 0, won: 0, lost: 0, wonValue: 0, totalValue: 0 };
    }
    // Leads count still uses the period's new contacts by source (reasonable —
    // "new leads" is inherently cohort-based, the rest of the funnel is activity).
    for (const key of sourceKeys) {
      sourceActivityAgg[key].leads = leadsBySource[key] || 0;
    }
    // Build a dealId → contactSource map from cohortDeals as fallback — used
    // when a deal has no lead_source set but we do have its contact's source.
    const dealIdToContactSource = new Map();
    for (const cd of cohortDeals) {
      if (cd.contactSource && cd.contactSource !== 'other') {
        dealIdToContactSource.set(cd.id, cd.contactSource);
      }
    }
    // Deals by their own source — includes repeat customers and old contacts.
    // Priority: deal.lead_source → contact analytics source → 'other'
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
    // Diagnostic: count how many deals got into each state for debugging
    const diag = {
      totalPeriodDeals: periodDeals.length,
      wonClosedInPeriod: periodDeals.filter((d) => d.status === 'won' && d.closedInPeriod).length,
      wonAnywhere: periodDeals.filter((d) => d.status === 'won').length,
      closedInPeriodCount: periodDeals.filter((d) => d.closedInPeriod).length,
      sourceDistribution: {},
      wonBySrcDiag: {},
    };
    for (const d of periodDeals) {
      diag.sourceDistribution[d.source] = (diag.sourceDistribution[d.source] || 0) + 1;
      if (d.status === 'won' && d.closedInPeriod) {
        const effectiveSrc = (!d.source || d.source === 'other') ? (dealIdToContactSource.get(d.id) || 'other') : d.source;
        diag.wonBySrcDiag[effectiveSrc] = (diag.wonBySrcDiag[effectiveSrc] || 0) + 1;
      }
    }
    console.log('[SourceActivity diag]', JSON.stringify(diag));

    // For repeat_client deals, build a breakdown of their original contact acquisition
    // source. A repeat client was originally brought in through some channel (Facebook,
    // organic, etc.) — this shows which channels are generating repeat business.
    const repeatClientOriginalSources = {};
    for (const d of periodDeals) {
      const effectiveSrc = (!d.source || d.source === 'other') ? (dealIdToContactSource.get(d.id) || null) : d.source;
      if (effectiveSrc !== 'repeat_client') continue;
      const originalSrc = dealIdToContactSource.get(d.id) || 'unknown';
      if (originalSrc === 'repeat_client') continue; // self-referential, skip
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
    // Cohort = deals from this rep's period contacts (using cohortDeals filtered
    // by contactRepId). Activity = deals owned by rep, created/closed in period
    // (using periodDeals filtered by ownerId).
    for (const rep of reps) {
      // Cohort
      const cohortRepDeals = cohortDeals.filter((d) => d.contactRepId === rep.id);
      const cw = cohortRepDeals.filter((d) => d.status === 'won');
      const cl = cohortRepDeals.filter((d) => d.status === 'lost');
      rep.cohortRevenue = cw.reduce((s, d) => s + d.amount, 0);
      rep.cohortAvgDealSize = cw.length > 0 ? Math.round(rep.cohortRevenue / cw.length) : 0;
      rep.cohortWinRate = (cw.length + cl.length) > 0 ? Math.round((cw.length / (cw.length + cl.length)) * 100) : null;
      // Activity
      const actRepDeals = periodDeals.filter((d) => d.ownerId === rep.id);
      const aw = actRepDeals.filter((d) => d.status === 'won' && d.closedInPeriod);
      const al = actRepDeals.filter((d) => d.status === 'lost' && d.closedInPeriod);
      rep.activityRevenue = aw.reduce((s, d) => s + d.amount, 0);
      rep.activityAvgDealSize = aw.length > 0 ? Math.round(rep.activityRevenue / aw.length) : 0;
      rep.activityWinRate = (aw.length + al.length) > 0 ? Math.round((aw.length / (aw.length + al.length)) * 100) : null;
    }

    // --- Enrich funnel sources with revenue/win-rate/avg-deal ---
    // Win rate uses contact-level cohort data (always available — no extra API calls):
    //   winRate = contacts that became customers / contacts that became deals
    // This matches the funnel row 2→3 conversion and works for ALL period lengths.
    //
    // Revenue + avg deal use deal-level data from cohortDeals, which is only populated
    // when source override ran (periods ≤30 days). For wider periods they are null so
    // the UI can distinguish "not available" from "$0".
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
      // Contact-level win rate — always computed from the funnel's own data
      const contactDeals = dealsBySource[s.key] || 0;
      const contactWon = wonBySource[s.key] || 0;
      s.winRate = contactDeals > 0 ? Math.round((contactWon / contactDeals) * 100) : null;
      // Revenue + avg deal only when we have deal-level data
      s.revenue = hasCohortDealData ? a.wonValue : null;
      s.avgDealSize = (hasCohortDealData && a.won > 0) ? Math.round(a.wonValue / a.won) : null;
      s.pipelineValue = a.totalValue;
    }

    const responsePayload = {
      period: { start: range.start, end: range.end, label: range.label },
      summary,
      funnel,
      funnelActivity,
      reps,
      pipeline,
      pipelineHealth,
      sources,
      // Omit individual contact records for wide periods (>14 days) — too many
      // to display usefully and a significant payload cost. Counts (leadCounts)
      // are always included so the summary cards stay accurate.
      // Contact records are omitted for wide periods (>14 days) to limit payload size.
      // SLA phone/Gmail signals still run for all periods (budget-capped at OP_BUDGET_MS).
      leads: skipSourceOverride ? [] : leads,
      leadsOmitted: skipSourceOverride,
      leadCounts,
      cohortDeals,
      periodDeals,
      dealsSentDeals,
      sla,
    };
    // Wide periods (Q1-Q4, year) are cached 30 min so the cron (every 10 min) always
    // finds a warm entry and never leaves a gap. Narrow periods stay at 10 min.
    const cacheTTL = periodDays > 30 ? 1800 : 600;
    await setCached(cacheKey, responsePayload, cacheTTL);
    return res.status(200).json(responsePayload);
  } catch (err) {
    console.error('Metrics API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
