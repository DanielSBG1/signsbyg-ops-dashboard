import { kv } from '@vercel/kv';
import { getCallsForParticipants, normalizePhone } from './_lib/sales/openphone.js';
import { searchAllCRM } from './_lib/sales/hubspot.js';

/**
 * One-time backfill endpoint. Pulls OpenPhone calls for the last N days via
 * the polling approach (HubSpot contact phones → OpenPhone) and writes each
 * call into the KV store using the same schema as the webhook handler.
 *
 * Idempotent — safe to run multiple times. Paginated so each invocation stays
 * under the Vercel function timeout. Each response includes a `nextUrl` field
 * telling you what to fetch next, or `done: true` when finished.
 *
 * Usage:
 *   GET /api/backfill-calls?days=30&page=0&pageSize=40
 *
 * Security: simple shared secret to prevent strangers from hammering your
 * OpenPhone API. Set BACKFILL_SECRET env var; pass it as ?secret=... .
 * (Not needed for local dev if the env var is unset.)
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const {
      days = '30',
      page = '0',
      pageSize = '40',
      secret = '',
    } = req.query;

    if (process.env.BACKFILL_SECRET && secret !== process.env.BACKFILL_SECRET) {
      return res.status(401).json({ error: 'Invalid secret' });
    }

    if (!process.env.OPENPHONE_API_KEY) {
      return res.status(400).json({ error: 'OPENPHONE_API_KEY not set' });
    }
    if (!(process.env.KV_REST_API_URL || process.env.KV_URL)) {
      return res.status(400).json({ error: 'KV not configured' });
    }

    const daysNum = Math.max(1, Math.min(90, parseInt(days) || 30));
    const pageNum = Math.max(0, parseInt(page) || 0);
    const pageSizeNum = Math.max(1, Math.min(200, parseInt(pageSize) || 40));
    const sinceISO = new Date(Date.now() - daysNum * 86400000).toISOString();

    // Pull HubSpot contacts modified in the last N days (for their phones)
    const hubspotContacts = await searchAllCRM('contacts', {
      filters: [{ propertyName: 'lastmodifieddate', operator: 'GTE', value: sinceISO }],
      properties: ['phone', 'mobilephone'],
      sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
    });

    const allPhones = [];
    const seen = new Set();
    for (const c of hubspotContacts.results) {
      for (const raw of [c.properties.phone, c.properties.mobilephone]) {
        const p = normalizePhone(raw);
        if (p && !seen.has(p)) {
          seen.add(p);
          allPhones.push(p);
        }
      }
    }

    const totalPhones = allPhones.length;
    const totalPages = Math.max(1, Math.ceil(totalPhones / pageSizeNum));
    const pageStart = pageNum * pageSizeNum;
    const pageEnd = Math.min(pageStart + pageSizeNum, totalPhones);
    const pagePhones = allPhones.slice(pageStart, pageEnd);
    console.log(`[Backfill] page ${pageNum + 1}/${totalPages} — phones ${pageStart}-${pageEnd}`);

    if (pagePhones.length === 0) {
      return res.status(200).json({
        done: true,
        message: 'No phones to process on this page',
        totalPhones,
        totalPages,
      });
    }

    const calls = await getCallsForParticipants(pagePhones, sinceISO);
    console.log(`[Backfill] page ${pageNum + 1}: got ${calls.length} calls, writing to KV...`);

    // Write each call to KV using the same schema as the webhook handler
    let written = 0;
    for (const c of calls) {
      try {
        const createdAt = c.createdAt || new Date().toISOString();
        const score = Date.parse(createdAt) || Date.now();
        const bucket = createdAt.substring(0, 7); // YYYY-MM
        const record = {
          id: c.id,
          eventType: 'backfill',
          direction: c.direction,
          status: c.status,
          createdAt,
          answeredAt: c.answeredAt,
          completedAt: c.completedAt,
          duration: c.duration,
          participants: [c.customerPhone, c.ourPhone].filter(Boolean),
          phoneNumberId: c.ourPhoneId,
          userId: c.userId,
          voicemail: c.voicemail,
          storedAt: Date.now(),
        };
        await Promise.all([
          kv.set(`op:call:${c.id}`, record, { ex: 60 * 60 * 24 * 90 }),
          kv.zadd(`op:call:index:${bucket}`, { score, member: c.id }),
        ]);
        written++;
      } catch (err) {
        console.warn(`[Backfill] failed to write call ${c.id}: ${err.message}`);
      }
    }

    const nextPage = pageNum + 1;
    const done = nextPage >= totalPages;
    const base = `/api/backfill-calls?days=${daysNum}&pageSize=${pageSizeNum}`;
    const secretParam = secret ? `&secret=${encodeURIComponent(secret)}` : '';

    return res.status(200).json({
      done,
      page: pageNum,
      totalPages,
      pageStart,
      pageEnd,
      phonesOnThisPage: pagePhones.length,
      callsFound: calls.length,
      callsWritten: written,
      nextUrl: done ? null : `${base}&page=${nextPage}${secretParam}`,
      message: done
        ? `✅ Backfill complete — processed ${totalPhones} phones across ${totalPages} pages`
        : `Processed page ${pageNum + 1}/${totalPages}. Fetch nextUrl to continue.`,
    });
  } catch (err) {
    console.error('[Backfill] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
