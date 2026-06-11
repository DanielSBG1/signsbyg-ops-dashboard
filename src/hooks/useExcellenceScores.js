// src/hooks/useExcellenceScores.js
import { useState, useEffect, useCallback } from 'react';

const POLL_MS     = 120_000;
const STORAGE_KEY = 'excellence:scores';

export function useExcellenceScores(period = 'month') {
  const [data, setData]       = useState(() => {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}:${period}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const refresh = useCallback(async (bust = false) => {
    try {
      const url = `/api/excellence-scores?period=${period}${bust ? '&bust=1' : ''}`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'API error');
      setData(json.data);
      setError(null);
      try { localStorage.setItem(`${STORAGE_KEY}:${period}`, JSON.stringify(json.data)); } catch {}
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    setLoading(true);
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, loading, error, refresh };
}
