import { getCallsForParticipants, getOpenPhoneUsers, getOpenPhoneNumbers, normalizePhone } from './_lib/sales/openphone.js';
import { searchAllCRM, getOwners } from './_lib/sales/hubspot.js';
import { getDateRange } from './_lib/sales/periods.js';
import { CLOSED_WON_STAGES, CLOSED_LOST_STAGES } from './_lib/sales/constants.js';
import { getCached, setCached } from './_lib/cache.js';
import { getCallsFromStore, storeHasAnyCalls } from './_lib/sales/callsStore.js';

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
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

    const { period = 'today', start: customStart, end: customEnd, page = '0', pageSize = '80' } = req.query;
    const range = getDateRange(period, customStart, customEnd);
    const pageNum = Math.max(0, parseInt(page) || 0);
    const pageSizeNum = Math.max(1, Math.min(500, parseInt(pageSize) || 80));

    // Response cache keyed by page as well so different pages cache separately
    const cacheKey = `callsv2:${period}:${customStart || ''}:${customEnd || ''}:p${pageNum}:s${pageSizeNum}`;
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

    // Polling fallback also respects the wide-period summary-only rule.
    // Without this, selecting a monthly period when the KV store is empty would
    // trigger an expensive HubSpot contact fetch + OpenPhone poll for months of data.
    if (summaryOnly) {
      const result = {
        period: { start: range.start, end: range.end, label: range.label },
        calls: [],
        summaryOnly: true,
        summary: { total: 0, inbound: 0, outbound: 0, missed: 0, answered: 0, avgDuration: 0, byClassification: null },
        pagination: { page: 0, pageSize: 0, totalPages: 1, totalPhones: 0 },
        source: 'polling-fallback-unavailable',
      };
      await setCached(cacheKey, result, 180);
      return res.status(200).json(result);
    }

    // 1. Polling fallback: pull HubSpot contacts in period, query OpenPhone.
    const hubspotContacts = await searchAllCRM('contacts', {
      filters: [
        { propertyName: 'lastmodifieddate', operator: 'GTE', value: range.start },
      ],
      properties: [
        'firstname', 'lastname', 'email', 'phone', 'mobilephone',
        'lifecyclestage', 'num_associated_deals', 'hubspot_owner_id', 'createdate',
      ],
      sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
    });
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
    const totalPages = Math.max(1, Math.ceil(totalPhones / pageSizeNum));
    const pageStart = pageNum * pageSizeNum;
    const pageEnd = Math.min(pageStart + pageSizeNum, totalPhones);
    const pagePhones = participantPhones.slice(pageStart, pageEnd);
    console.log(`[Calls] page ${pageNum + 1}/${totalPages} — querying phones ${pageStart}-${pageEnd} of ${totalPhones}`);

    // 2. Fetch OpenPhone calls for THIS page's phones + users + owners
    const [calls, opUsers, owners] = await Promise.all([
      getCallsForParticipants(pagePhones, range.start),
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
      const lifecycle = (contact.properties.lifecyclestage || '').toLowerCase();
      const numDeals = parseInt(contact.properties.num_associated_deals) || 0;
      if (lifecycle === 'customer') return 'existing_customer';
      if (numDeals > 0 || lifecycle === 'opportunity') return 'existing_deal';
      return 'existing_lead';
    }

    // 5. Enrich calls
    const enriched = calls.map((c) => {
      const contact = c.customerPhone ? phoneToContact.get(c.customerPhone) : null;
      const classification = classify(c);
      const opUserName = c.userId ? opUsers.get(c.userId) || null : null;
      // Try to map OpenPhone user to HubSpot owner for cross-system rep view
      let repName = opUserName;
      if (opUserName) {
        const matched = ownerByName[opUserName.toLowerCase()];
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
        contactName: contact ? `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim() || contact.properties.email : null,
        contactEmail: contact?.properties.email || null,
        contactId: contact?.id || null,
      };
    });

    // 6. Summary stats
    const summary = {
      total: enriched.length,
      inbound: enriched.filter((c) => c.direction === 'incoming').length,
      outbound: enriched.filter((c) => c.direction === 'outgoing').length,
      missed: enriched.filter((c) => c.status === 'missed' || c.voicemail).length,
      answered: enriched.filter((c) => c.duration > 0 && !c.voicemail).length,
      avgDuration: enriched.filter((c) => c.duration > 0).length > 0
        ? Math.round(
            enriched.filter((c) => c.duration > 0).reduce((sum, c) => sum + c.duration, 0) /
              enriched.filter((c) => c.duration > 0).length
          )
        : 0,
      byClassification: {
        new_prospect: enriched.filter((c) => c.classification === 'new_prospect').length,
        existing_lead: enriched.filter((c) => c.classification === 'existing_lead').length,
        existing_deal: enriched.filter((c) => c.classification === 'existing_deal').length,
        existing_customer: enriched.filter((c) => c.classification === 'existing_customer').length,
        unknown: enriched.filter((c) => c.classification === 'unknown').length,
      },
    };

    const responsePayload = {
      period: { start: range.start, end: range.end, label: range.label },
      calls: enriched,
      summary,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages,
        totalPhones,
      },
    };
    await setCached(cacheKey, responsePayload, 180);
    return res.status(200).json(responsePayload);
  } catch (err) {
    console.error('Calls API error:', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Fast summary for wide periods (>14 days). Skips HubSpot contact lookup
 * so there are no extra API calls — just iterates the stored call records.
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
      missed: storedCalls.filter((c) => c.status === 'missed' || c.voicemail).length,
      answered: answered.length,
      avgDuration: answered.length > 0 ? Math.round(totalDuration / answered.length) : 0,
      byClassification: null, // requires HubSpot lookup — skipped for wide periods
    },
    pagination: { page: 0, pageSize: 0, totalPages: 1, totalPhones: 0 },
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

  // Look up HubSpot contacts by those phones in one batch (chunked)
  const phoneToContact = new Map();
  const phoneList = [...customerPhones];
  const CHUNK = 100;
  for (let i = 0; i < phoneList.length; i += CHUNK) {
    const chunk = phoneList.slice(i, i + CHUNK);
    const variants = chunk.flatMap((p) => {
      const d = p.replace(/[^0-9]/g, '');
      const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
      return [p, d, ten, `+${d}`];
    });
    try {
      const results = await searchAllCRM('contacts', {
        filters: [{ propertyName: 'phone', operator: 'IN', values: variants }],
        properties: ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'lifecyclestage', 'num_associated_deals'],
      });
      for (const c of results.results || []) {
        for (const p of [c.properties.phone, c.properties.mobilephone].map(normalizePhone).filter(Boolean)) {
          if (customerPhones.has(p) && !phoneToContact.has(p)) phoneToContact.set(p, c);
        }
      }
    } catch (err) {
      console.warn(`[Calls] phone lookup error: ${err.message}`);
    }
  }

  function classify(call) {
    if (!call._customerPhone) return 'unknown';
    const contact = phoneToContact.get(call._customerPhone);
    if (!contact) return 'new_prospect'; // NOW actually fires — cold callers!
    const lifecycle = (contact.properties.lifecyclestage || '').toLowerCase();
    const numDeals = parseInt(contact.properties.num_associated_deals) || 0;
    if (lifecycle === 'customer') return 'existing_customer';
    if (numDeals > 0 || lifecycle === 'opportunity') return 'existing_deal';
    return 'existing_lead';
  }

  const ownerByName = {};
  for (const o of owners) {
    const name = `${o.firstName || ''} ${o.lastName || ''}`.trim();
    if (name) ownerByName[name.toLowerCase()] = name;
  }

  const enriched = enrichedRaw.map((c) => {
    const contact = c._customerPhone ? phoneToContact.get(c._customerPhone) : null;
    const classification = classify(c);
    const opUserName = c.userId ? opUsers.get(c.userId) || null : null;
    return {
      id: c.id,
      direction: c.direction,
      status: c.status,
      createdAt: c.createdAt,
      duration: c.duration,
      voicemail: c.voicemail,
      customerPhone: c._customerPhone,
      ourPhoneLabel: numberLabelById[c.phoneNumberId] || '',
      rep: opUserName || 'Unknown',
      classification,
      contactName: contact
        ? `${contact.properties.firstname || ''} ${contact.properties.lastname || ''}`.trim() || contact.properties.email
        : null,
      contactEmail: contact?.properties.email || null,
      contactId: contact?.id || null,
    };
  });

  const summary = {
    total: enriched.length,
    inbound: enriched.filter((c) => c.direction === 'incoming').length,
    outbound: enriched.filter((c) => c.direction === 'outgoing').length,
    missed: enriched.filter((c) => c.status === 'missed' || c.voicemail).length,
    answered: enriched.filter((c) => c.duration > 0 && !c.voicemail).length,
    avgDuration: enriched.filter((c) => c.duration > 0).length > 0
      ? Math.round(
          enriched.filter((c) => c.duration > 0).reduce((s, c) => s + c.duration, 0) /
            enriched.filter((c) => c.duration > 0).length
        )
      : 0,
    byClassification: {
      new_prospect: enriched.filter((c) => c.classification === 'new_prospect').length,
      existing_lead: enriched.filter((c) => c.classification === 'existing_lead').length,
      existing_deal: enriched.filter((c) => c.classification === 'existing_deal').length,
      existing_customer: enriched.filter((c) => c.classification === 'existing_customer').length,
      unknown: enriched.filter((c) => c.classification === 'unknown').length,
    },
  };

  return {
    period: { start: range.start, end: range.end, label: range.label },
    calls: enriched,
    summary,
    pagination: { page: 0, pageSize: enriched.length, totalPages: 1, totalPhones: customerPhones.size },
    source: 'webhook-store',
  };
}
