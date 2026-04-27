const HUBSPOT_BASE = 'https://api.hubapi.com';

// Token-bucket rate limiter: HubSpot allows 10 requests/sec per token.
// Tracks recent timestamps and waits if we'd exceed the cap. Allows true
// concurrency up to the limit instead of strict serialization.
const MAX_PER_SECOND = 9; // leave 1 RPS headroom
const recentCallTimes = [];

async function acquireSlot() {
  while (true) {
    const now = Date.now();
    // Drop timestamps older than 1 second
    while (recentCallTimes.length > 0 && now - recentCallTimes[0] > 1000) {
      recentCallTimes.shift();
    }
    if (recentCallTimes.length < MAX_PER_SECOND) {
      recentCallTimes.push(now);
      return;
    }
    // Wait until the oldest timestamp ages out
    const wait = 1001 - (now - recentCallTimes[0]);
    await new Promise((r) => setTimeout(r, wait));
  }
}

async function rateLimitedFetch(url, options, retries = 6) {
  await acquireSlot();
  const res = await fetch(url, options);
  if (res.status === 429 && retries > 0) {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s
    // Multiple concurrent Lambda instances each have their own per-instance
    // rate limiter, so the collective request rate can exceed HubSpot's
    // 10 req/sec secondly limit during cron pile-ups. Exponential backoff
    // spreads retries out so the burst clears before the next attempt.
    const backoff = Math.min(1000 * Math.pow(2, 6 - retries), 32000);
    console.warn(`[HubSpot] 429 rate limited, retrying in ${backoff}ms (${retries} retries left)`);
    await new Promise((r) => setTimeout(r, backoff));
    return rateLimitedFetch(url, options, retries - 1);
  }
  return res;
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function searchCRM(objectType, { filters = [], filterGroups, properties = [], sorts = [], limit = 200, after = undefined }) {
  const body = { limit, properties };
  if (filterGroups) {
    body.filterGroups = filterGroups;
  } else if (filters.length > 0) {
    body.filterGroups = [{ filters }];
  }
  if (sorts.length > 0) body.sorts = sorts;
  if (after) body.after = after;

  const res = await rateLimitedFetch(`${HUBSPOT_BASE}/crm/v3/objects/${objectType}/search`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot ${objectType} search failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function searchAllCRM(objectType, options) {
  const allResults = [];
  let after = undefined;

  while (true) {
    const page = await searchCRM(objectType, { ...options, after });
    allResults.push(...page.results);
    if (!page.paging?.next?.after) break;
    after = page.paging.next.after;
  }

  return { results: allResults, total: allResults.length };
}

export async function getContactsInRange(startISO, endISO) {
  // Two filter groups (OR): contacts created in range OR contacts that re-converted
  // (filled a form again) in range. Re-opt-ins matter — they signal renewed interest
  // even if the contact existed before.
  const properties = [
    'firstname', 'lastname', 'email', 'phone', 'mobilephone',
    'hs_analytics_source', 'hs_analytics_source_data_1',
    'hubspot_owner_id', 'createdate', 'lifecyclestage',
    'num_associated_deals', 'num_open_deals', 'hs_num_open_deals',
    'recent_conversion_date', 'first_conversion_date', 'num_conversion_events',
    'notes_last_contacted', 'notes_last_updated', 'num_notes',
    'hubspot_owner_assigneddate',
    'hs_last_sales_activity_timestamp', 'hs_email_last_send_date',
    'hs_sales_email_last_replied',
    // HubSpot's own "first engagement" — includes task completion, calls,
    // emails, meetings, chat. This is the most reliable SLA signal.
    'hs_sa_first_engagement_date', 'hs_time_to_first_engagement',
    // Lifecycle stage entry dates — if a rep moved the contact to SQL or
    // opportunity, that's engagement even if no communication note was logged
    'hs_lifecyclestage_salesqualifiedlead_date',
    'hs_lifecyclestage_opportunity_date',
    'hs_lifecyclestage_customer_date',
  ];

  const allResults = [];
  const seen = new Set();
  for (const dateProp of ['createdate', 'recent_conversion_date']) {
    let after = undefined;
    while (true) {
      const page = await searchCRM('contacts', {
        filters: [
          { propertyName: dateProp, operator: 'GTE', value: startISO },
          { propertyName: dateProp, operator: 'LTE', value: endISO },
        ],
        properties,
        sorts: [{ propertyName: dateProp, direction: 'DESCENDING' }],
        after,
      });
      for (const r of page.results) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          allResults.push(r);
        }
      }
      if (!page.paging?.next?.after) break;
      after = page.paging.next.after;
    }
  }
  return { results: allResults, total: allResults.length };
}

export async function getDealsInRange(startISO, endISO) {
  return searchAllCRM('deals', {
    filters: [
      { propertyName: 'createdate', operator: 'GTE', value: startISO },
      { propertyName: 'createdate', operator: 'LTE', value: endISO },
    ],
    properties: [
      'dealname', 'dealstage', 'pipeline', 'amount',
      'hubspot_owner_id', 'createdate', 'hs_lastmodifieddate', 'closedate',
      'lead_source',
    ],
    sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
  });
}

export async function getDealsModifiedInRange(startISO, endISO) {
  return searchAllCRM('deals', {
    filters: [
      { propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: startISO },
      { propertyName: 'hs_lastmodifieddate', operator: 'LTE', value: endISO },
    ],
    properties: [
      'dealname', 'dealstage', 'pipeline', 'amount',
      'hubspot_owner_id', 'createdate', 'hs_lastmodifieddate', 'closedate',
      'lead_source',
    ],
    sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
  });
}

// Fetches deals modified since rangeStart (broad net), requesting hs_date_entered_*
// for all open stages so that buildActivityFunnel can filter in-memory.
// HubSpot search doesn't support filtering on hs_date_entered_* properties directly.
export async function getDealsForActivityMode(openStageIds, startISO, endISO) {
  const stageProps = openStageIds.map((id) => `hs_date_entered_${id}`);
  return searchAllCRM('deals', {
    filters: [
      { propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: startISO },
    ],
    properties: ['dealname', 'dealstage', 'pipeline', 'amount', 'createdate', 'closedate', ...stageProps],
    sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
  });
}

export async function getDealsClosedInRange(startISO, endISO) {
  return searchAllCRM('deals', {
    filters: [
      { propertyName: 'closedate', operator: 'GTE', value: startISO },
      { propertyName: 'closedate', operator: 'LTE', value: endISO },
    ],
    properties: [
      'dealname', 'dealstage', 'pipeline', 'amount',
      'hubspot_owner_id', 'createdate', 'hs_lastmodifieddate', 'closedate',
      'lead_source',
    ],
    sorts: [{ propertyName: 'closedate', direction: 'DESCENDING' }],
  });
}

// WARNING: no filters — returns ALL deals via searchAllCRM pagination.
// HubSpot's search API has a hard 10 000-record cap per query (after=cursor stops
// at offset 10 000). If total deals exceed 10k this will silently truncate.
// Fix before that limit is hit: add a filter (e.g. pipeline IN [...] or
// hs_is_closed = false) to keep the result set bounded.
export async function getAllOpenDeals() {
  return searchAllCRM('deals', {
    properties: [
      'dealname', 'dealstage', 'pipeline', 'amount',
      'hubspot_owner_id', 'createdate', 'hs_lastmodifieddate',
      'closedate', 'lead_source',
      // Pipeline Health fields
      'hs_v2_date_entered_current_stage',
      'notes_last_contacted',
      'notes_last_updated',
    ],
    sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
  });
}

export async function getClosedWonDealsInRange(startISO, endISO, closedWonStages) {
  // HubSpot search doesn't support IN for dealstage, so we use multiple filter groups (OR)
  const allResults = [];
  for (const stage of closedWonStages) {
    const page = await searchAllCRM('deals', {
      filters: [
        { propertyName: 'closedate', operator: 'GTE', value: startISO },
        { propertyName: 'closedate', operator: 'LTE', value: endISO },
        { propertyName: 'dealstage', operator: 'EQ', value: stage },
      ],
      properties: [
        'dealname', 'amount', 'closedate', 'dealstage', 'pipeline',
        'hubspot_owner_id', 'pm_name', 'sbg_scope_of_work', 'street_address',
      ],
      sorts: [{ propertyName: 'closedate', direction: 'DESCENDING' }],
    });
    allResults.push(...page.results);
  }
  return { results: allResults, total: allResults.length };
}

// Batch fetch contact→deal associations. Returns Map<contactId, dealId[]>.
export async function getContactDealAssociationsBatch(contactIds) {
  const map = new Map();
  if (!contactIds || contactIds.length === 0) return map;
  const CHUNK = 100;
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const chunk = contactIds.slice(i, i + CHUNK);
    const res = await rateLimitedFetch(
      `${HUBSPOT_BASE}/crm/v4/associations/contacts/deals/batch/read`,
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ inputs: chunk.map((id) => ({ id: String(id) })) }),
      }
    );
    if (!res.ok) continue;
    const data = await res.json();
    for (const r of data.results || []) {
      const dealIds = (r.to || []).map((t) => String(t.toObjectId));
      map.set(String(r.from.id), dealIds);
    }
  }
  return map;
}

// Batch fetch deals by ID with selected properties.
export async function getDealsByIds(dealIds, properties) {
  const out = [];
  if (!dealIds || dealIds.length === 0) return out;
  const CHUNK = 100;
  for (let i = 0; i < dealIds.length; i += CHUNK) {
    const chunk = dealIds.slice(i, i + CHUNK);
    const res = await rateLimitedFetch(
      `${HUBSPOT_BASE}/crm/v3/objects/deals/batch/read`,
      {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          properties,
          inputs: chunk.map((id) => ({ id: String(id) })),
        }),
      }
    );
    if (!res.ok) continue;
    const data = await res.json();
    out.push(...(data.results || []));
  }
  return out;
}

export async function getDealContacts(dealId) {
  const res = await rateLimitedFetch(
    `${HUBSPOT_BASE}/crm/v3/objects/deals/${dealId}/associations/contacts`,
    { headers: headers() }
  );
  if (!res.ok) return false;
  const data = await res.json();
  return data.results && data.results.length > 0;
}

export async function getDealNotes(dealId) {
  const props = 'hs_note_body,hs_created_by_user_name,hs_createdate';
  const allNotes = [];
  let after = undefined;

  do {
    const url = `${HUBSPOT_BASE}/crm/v3/objects/notes?associations.deal=${dealId}&properties=${props}&limit=100${after ? `&after=${after}` : ''}`;
    const res = await rateLimitedFetch(url, { headers: headers() });
    if (!res.ok) break;
    const data = await res.json();
    allNotes.push(...(data.results || []));
    after = data.paging?.next?.after;
  } while (after);

  return allNotes;
}

// Fallback owner directory (HubSpot owners API requires scopes the token may lack)
const OWNER_DIRECTORY = {
  '49357269': 'Andrea Perales',
  '60630118': 'Robert Braley',
  '75480756': 'CRM Team',
  '76572883': 'Jonathan Vargas',
  '76860713': 'Amanda Garnier',
  '77302454': 'Zachari Quintero',
  '77772859': 'Maria Ines Bianco',
  '79273057': 'Melinda Shanklin',
  '79560885': 'Carola Salom',
  '80986284': 'Ricardo Guevara',
  '81461313': 'Yusseli Pernía',
  '81608066': 'Kavica Scott',
  '138077280': 'Ricardo Martinez',
  '159649493': '',
  '159659878': 'Stephen Miranda',
  '159759307': 'Bailey Peacock',
  '160670510': 'Quanice Shumpert',
  '161774309': 'Abhijeet Gaikwad',
  '162277230': 'Brailin Matos',
  '162557769': 'Accounting Dept',
  '162893149': 'Arif Rahman',
  '163074206': 'Siddhen Raut',
  '430775871': 'Antonella Briceno',
  '761399091': 'Alex Temple',
  '798946607': 'Billy Keith',
  '1022558458': 'Clarissa McKinney',
  '1241152267': 'Isabel Urquiza',
  '1796461421': 'Support On The Fuze',
  '1977160866': 'Daniel Garnier',
};

let _ownersCache = null;
let _ownersCacheExpires = 0;
export async function getOwners() {
  // 5-minute cache — owners list rarely changes
  if (_ownersCache && Date.now() < _ownersCacheExpires) return _ownersCache;
  // Try API first, fall back to hardcoded directory
  for (const url of [
    `${HUBSPOT_BASE}/crm/v3/owners?limit=100`,
    `${HUBSPOT_BASE}/owners/v2/owners?limit=100`,
  ]) {
    try {
      const res = await rateLimitedFetch(url, { headers: headers() });
      if (!res.ok) continue;
      const data = await res.json();
      const results = data.results || data;
      if (Array.isArray(results) && results.length > 0) {
        _ownersCache = results.map((o) => ({
          id: String(o.id || o.ownerId),
          firstName: o.firstName || o.firstname || '',
          lastName: o.lastName || o.lastname || '',
          email: o.email || '',
        }));
        _ownersCacheExpires = Date.now() + 5 * 60 * 1000;
        return _ownersCache;
      }
    } catch (err) {
      continue;
    }
  }
  // Use fallback directory
  console.warn('Owners API unavailable — using local directory');
  return Object.entries(OWNER_DIRECTORY)
    .filter(([, name]) => name)
    .map(([id, name]) => {
      const parts = name.split(' ');
      return { id, firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '', email: '' };
    });
}
