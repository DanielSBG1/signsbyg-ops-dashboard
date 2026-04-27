import { kv } from '@vercel/kv';
import crypto from 'crypto';

function normalizePhoneE164(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/[^0-9]/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (d.length >= 11) return `+${d}`;
  return null;
}

/**
 * OpenPhone webhook receiver.
 *
 * Accepts events from OpenPhone for:
 *   - call.completed
 *   - call.missed
 *   - call.recording.completed
 *   - message.received / message.delivered
 *
 * Stores each call/message in Vercel KV with a composite key so we can
 * later list them by time range. The /api/calls endpoint reads from KV
 * instead of polling OpenPhone — captures cold callers and is ~instant.
 *
 * Storage layout:
 *   op:call:{callId}       → full enriched call object (JSON)
 *   op:call:index:{dateBucket}  → sorted set of callIds for quick range queries
 *                                 score = timestamp, member = callId
 *
 * dateBucket = YYYY-MM (month granularity keeps the index small)
 *
 * Security: OpenPhone signs each webhook with an HMAC. Set
 * OPENPHONE_WEBHOOK_SECRET in env vars to enable signature verification.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Raw body for signature verification (Vercel parses JSON by default;
    // we re-serialize deterministically for HMAC)
    const body = req.body || {};
    const secret = process.env.OPENPHONE_WEBHOOK_SECRET;
    if (secret) {
      const sig = req.headers['openphone-signature'] || req.headers['x-openphone-signature'];
      if (!sig) {
        console.warn('[Webhook] missing signature header');
        return res.status(401).json({ error: 'Missing signature' });
      }
      const computed = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(body))
        .digest('hex');
      if (!sig.includes(computed)) {
        console.warn('[Webhook] signature mismatch');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const type = body.type || body.event || '';
    const data = body.data || body.payload || body;

    // Handle call events
    if (type.startsWith('call.')) {
      await storeCallEvent(data, type);
    }
    // Handle message events (used by SLA)
    else if (type.startsWith('message.')) {
      await storeMessageEvent(data, type);
    } else {
      console.log(`[Webhook] ignored event type: ${type}`);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Webhook] handler error:', err);
    // Return 200 so OpenPhone doesn't retry forever on our bugs
    return res.status(200).json({ ok: false, error: err.message });
  }
}

function monthBucket(iso) {
  if (!iso) return new Date().toISOString().substring(0, 7);
  return iso.substring(0, 7); // YYYY-MM
}

async function storeCallEvent(call, eventType) {
  if (!call || !call.id) return;

  const createdAt = call.createdAt || call.answeredAt || new Date().toISOString();
  const score = Date.parse(createdAt) || Date.now();

  // Extract customer phone — participant that isn't one of our workspace numbers
  // We don't know workspace numbers in this handler, so we store both and let
  // the reader figure it out (or we cache the workspace number list)
  const participants = Array.isArray(call.participants) ? call.participants : [];

  const record = {
    id: call.id,
    eventType,
    direction: call.direction || null,       // 'incoming' | 'outgoing'
    status: call.status || call.callStatus || null,
    createdAt,
    answeredAt: call.answeredAt || null,
    completedAt: call.completedAt || null,
    duration: call.duration || 0,
    participants,
    phoneNumberId: call.phoneNumberId || null,
    userId: call.userId || null,
    voicemail: !!call.voicemail,
    storedAt: Date.now(),
  };

  const bucket = monthBucket(createdAt);
  // Phone-indexed secondary: for each non-own participant, add timestamp to
  // a sorted set keyed by phone + direction. SLA lookups can then hit this
  // directly without scanning all calls.
  const phoneIndexOps = [];
  for (const p of participants) {
    const normalized = normalizePhoneE164(p);
    if (!normalized) continue;
    const key = `op:phone:${call.direction === 'outgoing' ? 'out' : 'in'}:${normalized}`;
    phoneIndexOps.push(kv.zadd(key, { score, member: call.id }));
  }
  await Promise.all([
    kv.set(`op:call:${call.id}`, record, { ex: 60 * 60 * 24 * 90 }),
    kv.zadd(`op:call:index:${bucket}`, { score, member: call.id }),
    ...phoneIndexOps,
  ]);
  // Wipe ALL cached /api/calls and /api/metrics responses so any period
  // view (today/week/month/...) shows the new call on next fetch.
  await invalidateResponseCache();
  console.log(`[Webhook] stored call ${call.id} (${eventType}) in bucket ${bucket}`);
}

async function invalidateResponseCache() {
  try {
    // KV scan for keys matching calls:* and metrics:*, delete them
    const patterns = ['calls:*', 'metrics:*'];
    for (const pattern of patterns) {
      let cursor = 0;
      do {
        const result = await kv.scan(cursor, { match: pattern, count: 100 });
        cursor = result[0];
        const keys = result[1];
        if (keys && keys.length > 0) {
          await Promise.all(keys.map((k) => kv.del(k)));
        }
      } while (cursor !== 0 && cursor !== '0');
    }
  } catch (err) {
    console.warn(`[Webhook] cache invalidation failed: ${err.message}`);
  }
}

async function storeMessageEvent(msg, eventType) {
  if (!msg || !msg.id) return;
  const createdAt = msg.createdAt || new Date().toISOString();
  const score = Date.parse(createdAt) || Date.now();
  const record = {
    id: msg.id,
    eventType,
    direction: msg.direction || null,
    createdAt,
    from: msg.from || null,
    to: msg.to || [],
    body: msg.body || '',
    phoneNumberId: msg.phoneNumberId || null,
    userId: msg.userId || null,
    storedAt: Date.now(),
  };
  const bucket = monthBucket(createdAt);
  // Index by phone for fast SLA lookup
  const targetPhones = [];
  if (msg.direction === 'outgoing') {
    if (Array.isArray(msg.to)) targetPhones.push(...msg.to);
    else if (msg.to) targetPhones.push(msg.to);
  } else {
    if (msg.from) targetPhones.push(msg.from);
  }
  const phoneIndexOps = [];
  for (const p of targetPhones) {
    const normalized = normalizePhoneE164(p);
    if (!normalized) continue;
    const key = `op:phone:${msg.direction === 'outgoing' ? 'out' : 'in'}:${normalized}`;
    phoneIndexOps.push(kv.zadd(key, { score, member: msg.id }));
  }
  await Promise.all([
    kv.set(`op:msg:${msg.id}`, record, { ex: 60 * 60 * 24 * 90 }),
    kv.zadd(`op:msg:index:${bucket}`, { score, member: msg.id }),
    ...phoneIndexOps,
  ]);
  await invalidateResponseCache();
}
