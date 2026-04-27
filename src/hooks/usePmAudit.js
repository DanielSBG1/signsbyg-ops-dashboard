import { useState, useEffect, useCallback } from 'react';

const POLL_MS = 120_000; // match cache TTL
const STORAGE_KEY = 'pm:audit';

export function usePmAudit() {
  const [data, setData] = useState(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/pm-audit');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'API error');
      setData(json.data);
      setError(null);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(json.data)); } catch {}
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, loading, error, refresh };
}
