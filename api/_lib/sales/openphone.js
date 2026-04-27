/**
 * OpenPhone API integration.
 *
 * Fetches calls and messages from the OpenPhone workspace, then builds a
 * phone-number → earliest-outbound-touch map. Used by the SLA calculation
 * to capture rep touches that happened via OpenPhone but were never logged
 * back to HubSpot.
 *
 * Requires env var: OPENPHONE_API_KEY
 */

const OP_BASE = 'https://api.openphone.com/v1';

function headers() {
  return {
    Authorization: process.env.OPENPHONE_API_KEY || '',
    'Content-Type': 'application/json',
  };
}

// Simple rate limiter — OpenPhone allows ~10 req/sec, we cap at ~5/sec to be safe
let lastOpCallTime = 0;
const MIN_OP_GAP_MS = 200;

async function rateLimitedFetch(url, options = {}) {
  const now = Date.now();
  const wait = MIN_OP_GAP_MS - (now - lastOpCallTime);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastOpCallTime = Date.now();
  return fetch(url, options);
}

/**
 * Normalize a phone number to E.164 (+1XXXXXXXXXX for US/Canada).
 * Returns null if it can't be parsed.
 */
export function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 11) return `+${digits}`;
  return null;
}

/**
 * Fetch all phone numbers in the workspace. Returns [{ id, phoneNumber, name }].
 */
export async function getOpenPhoneNumbers() {
  if (!process.env.OPENPHONE_API_KEY) {
    console.warn('[OpenPhone] OPENPHONE_API_KEY not set');
    return [];
  }
  try {
    const res = await rateLimitedFetch(`${OP_BASE}/phone-numbers`, { headers: headers() });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[OpenPhone] /phone-numbers failed: ${res.status} ${text}`);
      return [];
    }
    const data = await res.json();
    const numbers = (data.data || []).map((n) => ({
      id: n.id,
      phoneNumber: n.phoneNumber || n.formattedNumber,
      name: n.name || '',
    }));
    console.log(`[OpenPhone] Found ${numbers.length} workspace phone numbers`);
    return numbers;
  } catch (err) {
    console.warn(`[OpenPhone] numbers error: ${err.message}`);
    return [];
  }
}

/**
 * Fetch calls for a phone number since a given timestamp.
 * Paginates fully. Returns raw call records.
 */
async function getCallsForNumber(phoneNumberId, sinceISO) {
  const all = [];
  let pageToken;
  let safetyCount = 0;
  do {
    const url = new URL(`${OP_BASE}/calls`);
    url.searchParams.set('phoneNumberId', phoneNumberId);
    url.searchParams.set('createdAfter', sinceISO);
    url.searchParams.set('maxResults', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await rateLimitedFetch(url.toString(), { headers: headers() });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[OpenPhone] /calls failed for ${phoneNumberId}: ${res.status} ${text}`);
      break;
    }
    const data = await res.json();
    all.push(...(data.data || []));
    pageToken = data.nextPageToken;
    if (++safetyCount > 50) break;
  } while (pageToken);
  return all;
}

/**
 * Same for messages.
 */
async function getMessagesForNumber(phoneNumberId, sinceISO) {
  const all = [];
  let pageToken;
  let safetyCount = 0;
  do {
    const url = new URL(`${OP_BASE}/messages`);
    url.searchParams.set('phoneNumberId', phoneNumberId);
    url.searchParams.set('createdAfter', sinceISO);
    url.searchParams.set('maxResults', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await rateLimitedFetch(url.toString(), { headers: headers() });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[OpenPhone] /messages failed for ${phoneNumberId}: ${res.status} ${text}`);
      break;
    }
    const data = await res.json();
    all.push(...(data.data || []));
    pageToken = data.nextPageToken;
    if (++safetyCount > 50) break;
  } while (pageToken);
  return all;
}

/**
 * Fetch calls involving any of the given participant phones since `sinceISO`.
 * OpenPhone's /v1/calls endpoint requires a participants array, so we batch
 * the customer phones into chunks and query per workspace number.
 *
 * Returns enriched call records.
 */
export async function getCallsForParticipants(participantPhones, sinceISO) {
  if (!process.env.OPENPHONE_API_KEY) return [];
  if (!participantPhones || participantPhones.length === 0) return [];

  const numbers = await getOpenPhoneNumbers();
  if (numbers.length === 0) return [];
  const ownNumbers = new Set(numbers.map((n) => normalizePhone(n.phoneNumber)).filter(Boolean));
  const numberLabelById = {};
  for (const n of numbers) numberLabelById[n.id] = n.name || n.phoneNumber;

  // OpenPhone requires BOTH `participants` (single phone) AND `phoneNumberId`
  // (workspace number, must match ^PN.*$). We iterate every (phone × workspace)
  // pair. With high concurrency this works for short periods but will timeout
  // for very wide windows — that's a known limitation pending webhooks.
  const tasks = [];
  for (const phone of participantPhones) {
    for (const n of numbers) {
      tasks.push({ phone, phoneNumberId: n.id });
    }
  }
  console.log(`[OpenPhone] Running ${tasks.length} call queries (${participantPhones.length} phones × ${numbers.length} workspace numbers, concurrency 15)`);

  const all = [];
  const seenCallIds = new Set();
  const CONCURRENCY = 15;
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (t) => {
        try {
          return await fetchCallsForSinglePhone(t.phone, t.phoneNumberId, sinceISO);
        } catch (err) {
          console.warn(`[OpenPhone] calls error for ${t.phone}: ${err.message}`);
          return [];
        }
      })
    );
    for (const calls of results) {
      for (const c of calls) {
        if (seenCallIds.has(c.id)) continue;
        seenCallIds.add(c.id);
        const participants = (c.participants || []).map(normalizePhone).filter(Boolean);
        const customerPhone = participants.find((p) => !ownNumbers.has(p)) || null;
        const ourPhone = participants.find((p) => ownNumbers.has(p)) || null;
        all.push({
          id: c.id,
          direction: c.direction || 'unknown',
          status: c.status || c.callStatus || '',
          createdAt: c.createdAt || c.answeredAt || null,
          answeredAt: c.answeredAt || null,
          completedAt: c.completedAt || null,
          duration: c.duration || 0,
          customerPhone,
          ourPhone,
          ourPhoneId: c.phoneNumberId || null,
          ourPhoneLabel: numberLabelById[c.phoneNumberId] || ourPhone || '',
          userId: c.userId || null,
          voicemail: !!c.voicemail || c.status === 'voicemail',
        });
      }
    }
  }
  console.log(`[OpenPhone] Fetched ${all.length} unique calls across ${tasks.length} (phone × workspace) queries`);
  all.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  return all;
}

async function fetchCallsForSinglePhone(phone, phoneNumberId, sinceISO) {
  const all = [];
  let pageToken;
  let safety = 0;
  do {
    const params = [
      `participants=${encodeURIComponent(phone)}`,
      `phoneNumberId=${encodeURIComponent(phoneNumberId)}`,
      `createdAfter=${encodeURIComponent(sinceISO)}`,
      `maxResults=100`,
    ];
    if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const res = await rateLimitedFetch(`${OP_BASE}/calls?${params.join('&')}`, { headers: headers() });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // 404 is normal — many (phone × workspace) pairs have no history
      if (res.status !== 404) {
        console.warn(`[OpenPhone] /calls failed for ${phone}: ${res.status} ${text}`);
      }
      break;
    }
    const data = await res.json();
    all.push(...(data.data || []));
    pageToken = data.nextPageToken;
    if (++safety > 10) break;
  } while (pageToken);
  return all;
}

async function fetchMessagesForSinglePhone(phone, phoneNumberId, sinceISO) {
  const all = [];
  let pageToken;
  let safety = 0;
  do {
    const params = [
      `participants=${encodeURIComponent(phone)}`,
      `phoneNumberId=${encodeURIComponent(phoneNumberId)}`,
      `createdAfter=${encodeURIComponent(sinceISO)}`,
      `maxResults=100`,
    ];
    if (pageToken) params.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const res = await rateLimitedFetch(`${OP_BASE}/messages?${params.join('&')}`, { headers: headers() });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status !== 404) {
        console.warn(`[OpenPhone] /messages failed for ${phone}: ${res.status} ${text}`);
      }
      break;
    }
    const data = await res.json();
    all.push(...(data.data || []));
    pageToken = data.nextPageToken;
    if (++safety > 10) break;
  } while (pageToken);
  return all;
}

// Legacy alias for backwards compat — same signature as before but now returns empty
// (the old approach didn't pass participants and OpenPhone rejects it).
export async function getAllCallsInPeriod(sinceISO) {
  console.warn('[OpenPhone] getAllCallsInPeriod called without participants — returning empty. Use getCallsForParticipants instead.');
  return [];
}

/**
 * Fetch OpenPhone users (reps). Returns Map<userId, displayName>.
 */
export async function getOpenPhoneUsers() {
  if (!process.env.OPENPHONE_API_KEY) return new Map();
  try {
    const res = await rateLimitedFetch(`${OP_BASE}/users`, { headers: headers() });
    if (!res.ok) return new Map();
    const data = await res.json();
    const map = new Map();
    for (const u of data.data || []) {
      const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || u.id;
      map.set(u.id, name);
    }
    return map;
  } catch (err) {
    return new Map();
  }
}

/**
 * Build a Map<normalizedPhone, earliestOutboundTimestampMs> for the given
 * participant phones since `sinceISO`. OpenPhone requires participants on
 * /v1/calls and /v1/messages, so we batch-query per workspace number.
 */
export async function buildOpenPhoneActivityMap(participantPhones, sinceISO) {
  const result = new Map();
  if (!process.env.OPENPHONE_API_KEY) return result;
  if (!participantPhones || participantPhones.length === 0) return result;

  const numbers = await getOpenPhoneNumbers();
  if (numbers.length === 0) return result;
  const ownNumbers = new Set(numbers.map((n) => normalizePhone(n.phoneNumber)).filter(Boolean));

  function recordActivity(participants, direction, timestamp) {
    if (direction !== 'outgoing') return;
    const ts = Date.parse(timestamp || '');
    if (!ts) return;
    for (const p of participants || []) {
      const normalized = normalizePhone(p);
      if (!normalized || ownNumbers.has(normalized)) continue;
      const existing = result.get(normalized);
      if (!existing || ts < existing) result.set(normalized, ts);
    }
  }

  // (phone × workspace number) pairs
  const tasks = [];
  for (const phone of participantPhones) {
    for (const n of numbers) {
      tasks.push({ phone, phoneNumberId: n.id });
    }
  }
  const CONCURRENCY = 15;
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (t) => {
        try {
          const [calls, messages] = await Promise.all([
            fetchCallsForSinglePhone(t.phone, t.phoneNumberId, sinceISO),
            fetchMessagesForSinglePhone(t.phone, t.phoneNumberId, sinceISO),
          ]);
          for (const c of calls) {
            recordActivity(c.participants, c.direction, c.createdAt || c.answeredAt);
          }
          for (const m of messages) {
            recordActivity(m.to ? [...(m.to || []), m.from] : m.participants, m.direction, m.createdAt);
          }
        } catch (err) {
          console.warn(`[OpenPhone] activity error: ${err.message}`);
        }
      })
    );
  }
  return result;
}
