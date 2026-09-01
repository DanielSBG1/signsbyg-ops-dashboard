import { useState, useEffect, useCallback, useRef } from 'react';
import useVisibleInterval from '../useVisibleInterval.js';
import { idbRead, idbWrite } from '../../lib/idbCache.js';

const IDB_PREFIX = 'sbg_ra_v4';
const STALE_MAX_MS = 10 * 60 * 1000;  // 10 minutes
const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

function cacheKey(period, customRange) {
  return `${IDB_PREFIX}:${period}:${customRange?.start || ''}:${customRange?.end || ''}`;
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

    const key = cacheKey(period, customRange);
    const stale = await idbRead(key, STALE_MAX_MS);
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
      await idbWrite(key, json);
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
    setData(null);
    setLoading(true);
    fetchRepActivity();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [fetchRepActivity]);

  useVisibleInterval(fetchRepActivity, REFRESH_INTERVAL_MS, enabled);

  return { data, loading, error };
}
