import { getCallsForParticipants, getOpenPhoneUsers, getOpenPhoneNumbers, normalizePhone } from './_lib/sales/openphone.js';
import { searchAllCRM, getOwners } from './_lib/sales/hubspot.js';
import { getDateRange } from './_lib/sales/periods.js';
import { getCached, setCached } from './_lib/cache.js';
import { getCallsFromStore, storeHasAnyCalls } from './_lib/sales/callsStore.js';

// During polling fallback we cap the phone-lookup loop to limit OpenPhone API
// costs while the webhook store warms up. Once the webhook is populating the
// KV store, store mode covers the full call universe without this cap.
const POLLING_FALLBACK_PHONE_CAP = 80;

/**
 * /api/calls
 *
 * Returns enriched OpenPhone call records for the period, classified against
 * HubSpot contacts as: new_prospect, existing_lead, existing_deal, existing_customer.
 *
 * Query params:
 *   period: today | week | month | quarter | year | custom
 *   start, end: ISO dates if period=custom
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // CDN cache header — Vercel edge serves cached responses in <50ms.
    res.setHeader('Cache-Control', 'public, s-maxage=180, stale-while-revalidate=600');

    const { period = 'today', start: customStart, end: customEnd } = req.query;
    const range = getDateRange(period, customStart, customEnd);

    const cacheKey = `callsv5:${period}:${customStart || ''}:${customEnd || ''}`;
    const cachedResult = await getCached(cacheKey);
    if (cachedResult) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return res.status(200).json(cachedResult);
    }
    console.log(`[Cache MISS] ${cacheKey}`);

    if (!process.env.OPENPHONE_API_KEY) {
      return res.status(200).json({
        period: { start: range.start, end: range.end, label: range.label },
        calls: [],
        summary: { total: 0 },
        error: 'OPENPHONE_API_KEY not configured',
      });
    }

    // Try the KV store first (populated by openphone-webhook). If the store
    // has any calls at all, trust it — it's complete and instant. Otherwise
    // fall back to the polling approach (slower, HubSpot-known contacts only).
    const periodDays = (Date.parse(range.end) - Date.parse(range.start)) / 86400000;
    const summaryOnly = periodDays > 14;

    const storeReady = await storeHasAnyCalls();
    if (storeReady) {
      const storedCalls = await getCallsFromStore(range.start, range.end);
      console.log(`[Calls] Store mode: ${storedCalls.length} calls from KV for ${range.label} (summaryOnly=${summaryOnly})`);

      if (summaryOnly) {
        // For wide periods skip the HubSpot phone-lookup loop entirely — it's the
        // main cost driver. Compute totals directly from raw OpenPhone fields.
        const result = buildSummaryOnlyResponse(storedCalls, range);
        await setCached(cacheKey, result, 180);
        return res.status(200).json(result);
      }

      const [owners, opUsers, workspaceNumbers] = await Promise.all([
        getOwners(),
        getOpenPhoneUsers(),
        getOpenPhoneNumbers(),
      ]);
      const result = await buildCallsResponseFromStore(storedCalls, owners, opUsers, workspaceNumbers, range);
      await setCached(cacheKey, result, 180);
      return res.status(200).json(result);
    }

    // Polling fallback — KV store is empty (bootstrap state or webhook misconfigured).
    // This is a degraded path: only contacts HubSpot already knows about are matched,
    // and only the first page of phones is covered. The KV store should be populated
    // within minutes once the OpenPhone webhook is active.
    if (summaryOnly) {
      const result = {
        period: { start: range.start, end: range.end, label: range.label },
        calls: [],
        summaryOnly: true,
        summary: { total: 0, inbound: 0, outbound: 0, missed: 0, voicemail: 0, answered: 0, avgDuration: 0, byClassification: null },
        source: 'polling-fallback-unavailable',
      };
      await setCached(cacheKey, result, 180);
      return res.status(200).json(result);
    }

    // 1. Polling fallback: pull HubSpot contacts in period, query OpenPhone.
    let phoneEnrichmentPartial = false;
    let hubspotContacts;
    try {
      hubspotContacts = await searchAllCRM('contacts', {
        filters: [
          { propertyName: 'lastmodifieddate', operator: 'GTE', value: range.start },
        ],
        properties: [
          'firstname', 'lastname', 'email', 'phone', 'mobilephone',
          'lifecyclestage', 'num_associated_deals', 'hubspot_owner_id', 'createdate',
          'hs_analytics_source', 'hs_analytics_source_data_1', 'sbg_lead_source', 'hs_lead_status',
        ],
        sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
      });
    } catch (err) {
      console.warn(`[Calls] HubSpot contact pull failed: ${err.message}`);
      hubspotContacts = { results: [] };
      phoneEnrichmentPartial = true;
    }
    console.log(`[Calls] Pulled ${hubspotContacts.results.length} HubSpot contacts modified in period`);

    // Build phone → contact map and the participants list
    const phoneToContact = new Map();
    const participantPhones = [];
    for (const c of hubspotContacts.results) {
      const phones = [c.properties.phone, c.properties.mobilephone]
        .map(normalizePhone)
        .filter(Boolean);
      for (const p of phones) {
        if (!phoneToContact.has(p)) {
          phoneToContact.set(p, c);
          participantPhones.push(p);
        }
      }
    }
    const totalPhones = participantPhones.length;
    const cappedPhones = participantPhones.slice(0, POLLING_FALLBACK_PHONE_CAP);
    const wasCapped = participantPhones.length > POLLING_FALLBACK_PHONE_CAP;
    console.log(`[Calls] polling fallback: ${cappedPhones.length} of ${totalPhones} phones${wasCapped ? ' (CAPPED)' : ''}`);

    // 2. Fetch OpenPhone calls for this set of phones + users + owners
    const [calls, opUsers, owners] = await Promise.all([
      getCallsForParticipants(cappedPhones, range.start),
      getOpenPhoneUsers(),
      getOwners(),
    ]);

    // OpenPhone user → name + try to match against HubSpot owners by email/name
    const ownerByEmail = {};
    const ownerByName = {};
    for (const o of owners) {
      const name = `${o.firstName || ''} ${o.lastName || ''}`.trim();
      if (o.email) ownerByEmail[o.email.toLowerCase()] = { id: o.id, name };
      if (name) ownerByName[name.toLowerCase()] = { id: o.id, name };
    }

    // 3. Classify each call (phoneToContact already built above)
    function classify(call) {
      if (!call.customerPhone) return 'unknown';
      const contact = phoneToContact.get(call.customerPhone);
      if (!contact) return 'new_prospect';
      const leadStatusUpper = (contact.properties.hs_lead_status || '').toUpperCase();
      if (leadStatusUpper === 'UNQUALIFIED') return 'unknown';
      const lifecycle = (contact.properties.lifecyclestage || '').toLowerCase();
      const numDeals = parseInt(contact.properties.num_associated_deals) || 0;
      if (lifecycle === 'customer') return 'existing_customer';
      if (numDeals > 0 || lifecycle === 'opportunity') return 'existing_deal';
      return 'existing_lead';
    }

    // 4. Enrich calls
    const enriched = calls.map((c) => {
      const contact = c.customerPhone ? phoneToContact.get(c.customerPhone) : null;
      const classification = classify(c);
      const opUser = c.userId ? opUsers.get(c.userId) || null : null;
      // Try email match first (most reliable), then name match
      let repName = opUser?.name || null;
      if (opUser) {
        const emailMatch = opUser.email ? ownerByEmail[opUser.email.toLowerCase()] : null;
        const nameMatch = opUser.name ? ownerByName[opUser.name.toLowerCase()] : null;
        const matched = emailMatch || nameMatch;
        if (matched) repName = matched.name;
      }
      return {
        id: c.id,
        direction: c.direction,
        status: c.status,
        createdAt: c.createdAt,
        duration: c.duration,
        voicemail: c.voicemail,
        customerPhone: c.customerPhone,
        ourPhoneLabel: c.ourPhoneLabel,
        rep: repName || 'Unknown',
        classification,
        contactSource: resolveSource(contact),
        contactName: contact ? `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim() || contact.properties.email : null,
        contactEmail: contact?.properties.email || null,
        contactId: contact?.id || null,
      };
    });

    const summary = buildSummary(enriched);
    summary.byDay = buildDayBreakdown(enriched);

    const responsePayload = {
      period: { start: range.start, end: range.end, label: range.label },
      calls: enriched,
      summary,
      phoneEnrichmentPartial,
      meta: {
        totalPhones,
        cappedAt: wasCapped ? POLLING_FALLBACK_PHONE_CAP : null,
      },
      source: 'polling-fallback',
    };
    await setCached(cacheKey, responsePayload, 180);
    return res.status(200).json(responsePayload);
  } catch (err) {
    console.error('Calls API error:', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Resolve the marketing source for a HubSpot contact using custom and
 * analytics source properties.
 */
function resolveSource(contact) {
  if (!contact) return null;
  if (contact.properties.sbg_lead_source) return contact.properties.sbg_lead_source;
  const src = (contact.properties.hs_analytics_source || '').toLowerCase();
  const detail = (contact.properties.hs_analytics_source_data_1 || '').toLowerCase();
  if (detail.includes('facebook') || detail.includes('fb') || src === 'paid_social') return 'Facebook / Instagram';
  if (detail.includes('google') || src === 'paid_search') return 'Google Ads';
  if (src === 'organic_search') return 'Organic Search';
  if (src === 'referrals') return 'Referral';
  if (src === 'direct_traffic') return 'Direct';
  if (src === 'email_marketing') return 'Email';
  if (src) return src;
  return null;
}

/**
 * Build call summary stats from an enriched call array.
 * Splits voicemail and missed into separate buckets (different action items).
 * avgDuration excludes voicemails so it reflects actual conversation length.
 */
function buildSummary(enriched) {
  const counts = enriched.reduce((acc, c) => {
    acc.total++;
    if (c.direction === 'incoming') acc.inbound++;
    else if (c.direction === 'outgoing') acc.outbound++;
    if (c.voicemail) {
      acc.voicemail++;
    } else if (c.status === 'missed' || c.status === 'no-answer') {
      acc.missed++;
    }
    if (c.duration > 0 && !c.voicemail) {
      acc.answered++;
      acc.totalAnsweredDuration += c.duration;
    }
    acc.byClassification[c.classification] = (acc.byClassification[c.classification] || 0) + 1;
    return acc;
  }, {
    total: 0, inbound: 0, outbound: 0, missed: 0, voicemail: 0,
    answered: 0, totalAnsweredDuration: 0,
    byClassification: { new_prospect: 0, existing_lead: 0, existing_deal: 0, existing_customer: 0, unknown: 0 },
  });

  const summary = {
    total: counts.total,
    inbound: counts.inbound,
    outbound: counts.outbound,
    missed: counts.missed,
    voicemail: counts.voicemail,
    answered: counts.answered,
    avgDuration: counts.answered > 0 ? Math.round(counts.totalAnsweredDuration / counts.answered) : 0,
    byClassification: counts.byClassification,
  };

  // Unique inbound callers (deduplicated by phone)
  const uniqueInboundPhones = new Set(
    enriched.filter((c) => c.direction === 'incoming' && c.customerPhone).map((c) => c.customerPhone)
  );
  summary.uniqueInboundCallers = uniqueInboundPhones.size;
  summary.newInquiries = enriched.filter((c) => c.classification === 'new_prospect' && c.direction === 'incoming').length;

  // Source breakdown (inbound only, identified contacts only)
  const sourceMap = {};
  for (const c of enriched) {
    if (c.direction === 'incoming' && c.contactSource) {
      sourceMap[c.contactSource] = (sourceMap[c.contactSource] || 0) + 1;
    }
  }
  summary.bySource = Object.entries(sourceMap)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  return summary;
}

/**
 * Build daily volume breakdown from an enriched call array.
 */
function buildDayBreakdown(enriched) {
  const dayMap = {};
  for (const c of enriched) {
    if (!c.createdAt) continue;
    const day = c.createdAt.slice(0, 10);
    if (!dayMap[day]) {
      dayMap[day] = { date: day, total: 0, inbound: 0, outbound: 0, newInquiries: 0, uniquePhones: new Set() };
    }
    dayMap[day].total++;
    if (c.direction === 'incoming') {
      dayMap[day].inbound++;
      if (c.customerPhone) dayMap[day].uniquePhones.add(c.customerPhone);
    } else if (c.direction === 'outgoing') {
      dayMap[day].outbound++;
    }
    if (c.classification === 'new_prospect' && c.direction === 'incoming') {
      dayMap[day].newInquiries++;
    }
  }
  return Object.values(dayMap)
    .map(({ uniquePhones, ...rest }) => ({ ...rest, uniqueCallers: uniquePhones.size }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Fast summary for wide periods (>14 days). Skips HubSpot contact lookup
 * so there are no extra API calls — just iterates the stored call records.
 * Splits voicemail from missed to match the full-detail response shape.
 */
function buildSummaryOnlyResponse(storedCalls, range) {
  const answered = storedCalls.filter((c) => c.duration > 0 && !c.voicemail);
  const totalDuration = answered.reduce((s, c) => s + (c.duration || 0), 0);
  return {
    period: { start: range.start, end: range.end, label: range.label },
    calls: [],
    summaryOnly: true,
    summary: {
      total: storedCalls.length,
      inbound: storedCalls.filter((c) => c.direction === 'incoming').length,
      outbound: storedCalls.filter((c) => c.direction === 'outgoing').length,
      missed: storedCalls.filter((c) => (c.status === 'missed' || c.status === 'no-answer') && !c.voicemail).length,
      voicemail: storedCalls.filter((c) => c.voicemail).length,
      answered: answered.length,
      avgDuration: answered.length > 0 ? Math.round(totalDuration / answered.length) : 0,
      byClassification: null, // requires HubSpot lookup — skipped for wide periods
    },
    source: 'webhook-store',
  };
}

/**
 * Build the Calls API response from webhook-stored call records.
 * Classifies each call by phone-matching against HubSpot contacts lookup.
 */
async function buildCallsResponseFromStore(storedCalls, owners, opUsers, workspaceNumbers, range) {
  // Set of our own numbers (normalized) so we can identify customer phones
  const ownSet = new Set(workspaceNumbers.map((n) => normalizePhone(n.phoneNumber)).filter(Boolean));
  const numberLabelById = {};
  for (const n of workspaceNumbers) numberLabelById[n.id] = n.name || n.phoneNumber;

  // Extract unique customer phones from stored calls
  const customerPhones = new Set();
  const enrichedRaw = storedCalls.map((c) => {
    const participants = (c.participants || []).map(normalizePhone).filter(Boolean);
    const customerPhone = participants.find((p) => !ownSet.has(p)) || null;
    if (customerPhone) customerPhones.add(customerPhone);
    return { ...c, _customerPhone: customerPhone };
  });

  // Look up HubSpot contacts by those phones in one batch (chunked).
  // Uses hs_searchable_calculated_phone_number instead of raw `phone` to avoid
  // literal-string mismatches from formatting differences like "(713) 555-1234" vs "7135551234".
  const phoneToContact = new Map();
  const phoneList = [...customerPhones];
  const CHUNK = 100;
  let phoneEnrichmentPartial = false;
  for (let i = 0; i < phoneList.length; i += CHUNK) {
    const chunk = phoneList.slice(i, i + CHUNK);
    const normalizedDigits = [...new Set(chunk.map((p) => p.replace(/[^0-9]/g, '')).filter(Boolean))];
    try {
      const results = await searchAllCRM('contacts', {
        filters: [{ propertyName: 'hs_searchable_calculated_phone_number', operator: 'IN', values: normalizedDigits }],
        properties: ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'lifecyclestage', 'num_associated_deals', 'hs_analytics_source', 'hs_analytics_source_data_1', 'sbg_lead_source', 'hs_lead_status'],
      });
      for (const c of results.results || []) {
        for (const p of [c.properties.phone, c.properties.mobilephone].map(normalizePhone).filter(Boolean)) {
          if (customerPhones.has(p) && !phoneToContact.has(p)) phoneToContact.set(p, c);
        }
      }
    } catch (err) {
      console.warn(`[Calls] phone lookup error: ${err.message}`);
      phoneEnrichmentPartial = true;
    }
  }

  function classify(call) {
    if (!call._customerPhone) return 'unknown';
    const contact = phoneToContact.get(call._customerPhone);
    if (!contact) return 'new_prospect'; // cold callers — not in HubSpot at all
    const leadStatusUpper = (contact.properties.hs_lead_status || '').toUpperCase();
    if (leadStatusUpper === 'UNQUALIFIED') return 'unknown'; // exclude junk/disqualified records
    const lifecycle = (contact.properties.lifecyclestage || '').toLowerCase();
    const numDeals = parseInt(contact.properties.num_associated_deals) || 0;
    if (lifecycle === 'customer') return 'existing_customer';
    if (numDeals > 0 || lifecycle === 'opportunity') return 'existing_deal';
    return 'existing_lead';
  }

  const ownerByEmail = {};
  const ownerByName = {};
  for (const o of owners) {
    const name = `${o.firstName || ''} ${o.lastName || ''}`.trim();
    if (o.email) ownerByEmail[o.email.toLowerCase()] = { id: o.id, name };
    if (name) ownerByName[name.toLowerCase()] = { id: o.id, name };
  }

  const enriched = enrichedRaw.map((c) => {
    const contact = c._customerPhone ? phoneToContact.get(c._customerPhone) : null;
    const classification = classify(c);
    const opUser = c.userId ? opUsers.get(c.userId) || null : null;
    // Try email match first (most reliable), then name match
    let repName = opUser?.name || null;
    if (opUser) {
      const emailMatch = opUser.email ? ownerByEmail[opUser.email.toLowerCase()] : null;
      const nameMatch = opUser.name ? ownerByName[opUser.name.toLowerCase()] : null;
      const matched = emailMatch || nameMatch;
      if (matched) repName = matched.name;
    }
    return {
      id: c.id,
      direction: c.direction,
      status: c.status,
      createdAt: c.createdAt,
      duration: c.duration,
      voicemail: c.voicemail,
      customerPhone: c._customerPhone,
      ourPhoneLabel: numberLabelById[c.phoneNumberId] || '',
      rep: repName || 'Unknown',
      classification,
      contactSource: resolveSource(contact),
      contactName: contact
        ? `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim() || contact.properties.email
        : null,
      contactEmail: contact?.properties.email || null,
      contactId: contact?.id || null,
    };
  });

  const summary = buildSummary(enriched);
  summary.byDay = buildDayBreakdown(enriched);

  return {
    period: { start: range.start, end: range.end, label: range.label },
    calls: enriched,
    summary,
    phoneEnrichmentPartial,
    meta: { totalPhones: customerPhones.size },
    source: 'webhook-store',
  };
}
