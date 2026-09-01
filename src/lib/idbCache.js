import { get, set, clear } from 'idb-keyval';

export async function idbRead(key, maxAgeMs) {
  try {
    const entry = await get(key);
    if (!entry) return null;
    if (maxAgeMs && Date.now() - entry.t > maxAgeMs) return null;
    return entry.d;
  } catch { return null; }
}

export async function idbWrite(key, data) {
  try {
    await set(key, { d: data, t: Date.now() });
  } catch {}
}

export async function idbClearAll() {
  try { await clear(); } catch {}
}
