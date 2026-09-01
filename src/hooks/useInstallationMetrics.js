import { useState, useEffect, useCallback } from 'react';
import useVisibleInterval from './useVisibleInterval.js';

const POLL_MS = 15 * 60 * 1000; // 15 min

export function useInstallationMetrics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Phase 1: slim summary (no jobs array)
      const res = await fetch('/api/installation-metrics');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefreshed(new Date());

      // Phase 2: fetch full jobs array in background
      fetch('/api/installation-metrics?include=jobs')
        .then((r) => r.ok ? r.json() : null)
        .then((full) => {
          if (full) setData((prev) => prev ? { ...prev, jobs: full.jobs, jobsOmitted: false } : full);
        })
        .catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useVisibleInterval(fetchData, POLL_MS);

  return { data, loading, error, lastRefreshed, refresh: fetchData };
}