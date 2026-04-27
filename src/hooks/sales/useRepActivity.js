import { useState, useEffect, useCallback, useRef } from 'react';

const LS_PREFIX = 'sbg_ra_v4';
const STALE_MAX_MS = 10 * 60 * 1000;  // 10 minutes
const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

function lsKey(period, customRange) {
  return `${LS_PREFIX}:${period}:${customRange?.start || ''}:${customRange?.end || ''}`;
}

function lsRead(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { d, t } = JSON.parse(raw);
    if (Date.now() - t > STALE_MAX_MS) return null;
    return d;
  } catch { return null; }
}

function lsWrite(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ d: data, t: Date.now() })); } catch {}
}

export function useRepActivity(enabled = true, period = 'today', customRange = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const intervalRef = useRef(null);

  const customStart = customRange?.start ?? null;
  const customEnd   = customRange?.end   ?? null;

  const fetchRepActivity = useCallback(async () => {
    if (!enabled) return;
    setError(null);

    const key = lsKey(period, customRange);
    const stale = lsRead(key);
    if (stale) {
      setData(stale);
      setLoading(false);
    } else {
      setLoading(true);
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const params = new URLSearchParams({ period });
      if (customStart) params.set('customStart', customStart);
      if (customEnd)   params.set('customEnd',   customEnd);
      const res = await fetch(`/api/sales-rep-activity?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();
      lsWrite(key, json);
      setData(json);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, period, customStart, customEnd]);

  useEffect(() => {
    // Clear stale data from a different period immediately
    setData(null);
    setLoading(true);
    fetchRepActivity();

    intervalRef.current = setInterval(fetchRepActivity, REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(intervalRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchRepActivity]);

  return { data, loading, error };
}
