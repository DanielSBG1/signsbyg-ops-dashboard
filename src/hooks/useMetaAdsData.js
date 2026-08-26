import { useState, useEffect, useCallback, useRef } from 'react';
import useVisibleInterval from './useVisibleInterval.js';

const POLL_MS = 900_000; // 15 minutes

export function useMetaAdsData(preset = 'month') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const abortRef = useRef(null);

  const refresh = useCallback(async (signal) => {
    try {
      const res = await fetch(`/api/meta-ads-metrics?preset=${preset}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'API error');
      setData(json.data);
      setLastRefreshed(new Date());
      setError(null);
    } catch (e) {
      if (e.name === 'AbortError') return; // cancelled — ignore
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [preset]);

  useEffect(() => {
    // Abort previous fetch if preset changed
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    refresh(controller.signal);
    return () => controller.abort();
  }, [preset, refresh]);

  // Poll without abort controller (latest preset is already in the callback)
  const poll = useCallback(() => refresh(), [refresh]);
  useVisibleInterval(poll, POLL_MS);

  return { data, loading, error, lastRefreshed, refresh: poll };
}
