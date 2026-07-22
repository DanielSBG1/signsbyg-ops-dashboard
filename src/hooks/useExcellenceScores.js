import { useState, useEffect, useCallback } from 'react';
import useVisibleInterval from './useVisibleInterval.js';

const POLL_MS = 120_000;

export function useExcellenceScores(period = 'month') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async (bust = false) => {
    try {
      const url = `/api/excellence-scores?period=${period}${bust ? '&bust=1' : ''}`;
      const res = await fetch(url);
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
  }, [period]);

  useEffect(() => { setLoading(true); refresh(); }, [refresh]);
  useVisibleInterval(refresh, POLL_MS);

  return { data, loading, error, refresh };
}
