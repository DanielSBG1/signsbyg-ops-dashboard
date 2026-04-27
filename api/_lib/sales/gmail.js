/**
 * Gmail API integration via Google Workspace service account.
 *
 * Uses domain-wide delegation to impersonate reps and check if they've
 * sent emails to specific contacts. Used by the SLA signal chain to catch
 * emails sent without the HubSpot Sales extension.
 *
 * Requires env vars:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL  - service account email
 *   GOOGLE_SERVICE_ACCOUNT_KEY    - private key (PEM format, newlines as \n)
 *   GOOGLE_WORKSPACE_DOMAIN       - e.g. signsbyghouston.com
 *
 * Setup: see comments at bottom of this file.
 */

const GMAIL_ENABLED = !!(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY
);

/**
 * Create a JWT and exchange it for a Google access token.
 * Impersonates `userEmail` via domain-wide delegation.
 */
async function getAccessToken(userEmail) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    sub: userEmail, // impersonate this user
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY.replace(/\\n/g, '\n');

  // Import crypto for JWT signing
  const crypto = await import('crypto');
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${b64url(header)}.${b64url(claim)}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(key, 'base64url');
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn(`[Gmail] token exchange failed for ${userEmail}: ${res.status} ${text}`);
    return null;
  }
  const data = await res.json();
  return data.access_token;
}

// Simple in-memory token cache (per rep email, 50-min TTL)
const tokenCache = new Map();
async function getCachedToken(userEmail) {
  const cached = tokenCache.get(userEmail);
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  const token = await getAccessToken(userEmail);
  if (token) {
    tokenCache.set(userEmail, { token, expiresAt: Date.now() + 50 * 60 * 1000 });
  }
  return token;
}

/**
 * Check if `senderEmail` sent any email to `recipientEmail` after `sinceISO`.
 * Returns the timestamp (ms) of the earliest matching sent email, or null.
 */
export async function getEarliestSentEmail(senderEmail, recipientEmail, sinceISO) {
  if (!GMAIL_ENABLED) return null;
  if (!senderEmail || !recipientEmail) return null;

  try {
    const token = await getCachedToken(senderEmail);
    if (!token) return null;

    // Convert ISO to Gmail epoch seconds
    const afterEpoch = Math.floor(Date.parse(sinceISO) / 1000);
    // Gmail search query: sent to recipient, after date, in sent folder
    const query = encodeURIComponent(`to:${recipientEmail} after:${afterEpoch} in:sent`);
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=1`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status !== 404) {
        const text = await res.text().catch(() => '');
        console.warn(`[Gmail] search failed for ${senderEmail} → ${recipientEmail}: ${res.status} ${text}`);
      }
      return null;
    }
    const data = await res.json();
    if (!data.messages || data.messages.length === 0) return null;

    // Get the message detail for the timestamp
    const msgId = data.messages[0].id;
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!msgRes.ok) return null;
    const msg = await msgRes.json();
    // internalDate is epoch ms
    return parseInt(msg.internalDate) || null;
  } catch (err) {
    console.warn(`[Gmail] error checking ${senderEmail} → ${recipientEmail}: ${err.message}`);
    return null;
  }
}

/**
 * Batch check: for each { senderEmail, recipientEmail } pair, find earliest
 * sent email after sinceISO. Returns Map<recipientEmail, timestampMs>.
 * Dedupes by recipient (first match wins).
 */
export async function buildGmailActivityMap(pairs, sinceISO) {
  const result = new Map();
  if (!GMAIL_ENABLED || !pairs || pairs.length === 0) return result;
  console.log(`[Gmail] Checking ${pairs.length} sender→recipient pairs since ${sinceISO}`);

  // Run with concurrency to respect Gmail API rate limits (10 QPS per user)
  const CONCURRENCY = 5;
  for (let i = 0; i < pairs.length; i += CONCURRENCY) {
    const batch = pairs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ({ senderEmail, recipientEmail }) => {
        const ts = await getEarliestSentEmail(senderEmail, recipientEmail, sinceISO);
        return { recipientEmail, ts };
      })
    );
    for (const { recipientEmail, ts } of results) {
      if (ts && (!result.has(recipientEmail) || ts < result.get(recipientEmail))) {
        result.set(recipientEmail, ts);
      }
    }
  }
  console.log(`[Gmail] Found ${result.size} contacts with sent email activity`);
  return result;
}

export { GMAIL_ENABLED };

/*
 * ============================================================
 * SETUP INSTRUCTIONS — Google Workspace domain-wide delegation
 * ============================================================
 *
 * 1. Go to https://console.cloud.google.com/
 *    - Create a new project (or use existing)
 *    - Enable the "Gmail API"
 *
 * 2. Create a Service Account:
 *    - IAM & Admin → Service Accounts → Create
 *    - Name it "signsbyg-dashboard"
 *    - After creation, click into it → Keys → Add Key → JSON
 *    - Download the JSON key file
 *    - From the JSON, extract:
 *      - `client_email` → GOOGLE_SERVICE_ACCOUNT_EMAIL
 *      - `private_key` → GOOGLE_SERVICE_ACCOUNT_KEY
 *
 * 3. Enable domain-wide delegation:
 *    - In the service account details, check "Enable Google Workspace
 *      Domain-wide Delegation"
 *    - Copy the "Unique ID" (numeric)
 *
 * 4. Authorize in Google Workspace Admin:
 *    - Go to https://admin.google.com/
 *    - Security → API Controls → Domain-wide Delegation → Add new
 *    - Client ID = the numeric unique ID from step 3
 *    - OAuth scopes = https://www.googleapis.com/auth/gmail.readonly
 *    - Authorize
 *
 * 5. Add env vars to Vercel + .env.local:
 *    GOOGLE_SERVICE_ACCOUNT_EMAIL=signsbyg-dashboard@your-project.iam.gserviceaccount.com
 *    GOOGLE_SERVICE_ACCOUNT_KEY=-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n
 *    GOOGLE_WORKSPACE_DOMAIN=signsbyghouston.com
 *
 * 6. Redeploy. Gmail checks will automatically activate when the env vars
 *    are detected.
 */
