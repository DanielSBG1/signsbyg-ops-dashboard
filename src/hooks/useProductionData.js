import { useState, useEffect, useCallback } from 'react';
import useVisibleInterval from './useVisibleInterval.js';

const POLL_MS = 120_000; // match cache TTL

export function useProductionData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/production-metrics');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'API error');
      setData(json.data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useVisibleInterval(refresh, POLL_MS);

  return { data, loading, error, refresh };
}