/**
 * Two-tier TTL cache: Vercel KV (Redis) + in-memory fallback.
 * Same pattern as signsbyg-sales-dashboard/api/_lib/cache.js.
 */
import { kv } from '@vercel/kv';

const KV_ENABLED = !!(process.env.KV_REST_API_URL || process.env.KV_URL);

const memStore = new Map();

function memGet(key) {
  const entry = memStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { memStore.delete(key); return null; }
  return entry.value;
}

function memSet(key, value, ttlSeconds) {
  memStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  if (memStore.size > 100) memStore.delete(memStore.keys().next().value);
}

export async function getCached(key) {
  const hit = memGet(key);
  if (hit !== null) return hit;
  if (KV_ENABLED) {
    try {
      const value = await kv.get(key);
      if (value !== null && value !== undefined) {
        memSet(key, value, 60);
        return value;
      }
    } catch (err) {
      console.warn(`[Cache] KV get failed: ${err.message}`);
    }
  }
  return null;
}

export async function setCached(key, value, ttlSeconds) {
  memSet(key, value, ttlSeconds);
  if (KV_ENABLED) {
    try {
      await kv.set(key, value, { ex: ttlSeconds });
    } catch (err) {
      console.warn(`[Cache] KV set failed: ${err.message}`);
    }
  }
}

export async function cached(key, ttlSeconds, fn) {
  const hit = await getCached(key);
  if (hit !== null) return hit;
  const value = await fn();
  await setCached(key, value, ttlSeconds);
  return value;
}
