import { useState, useEffect, useCallback, useRef } from 'react';
import useVisibleInterval from './useVisibleInterval.js';

const POLL_MS = 120_000; // match cache TTL

export function useProductionData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const fetchDrillDown = useCallback((signal) => {
    fetch('/api/production-metrics?include=jobs', { signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((full) => {
        if (full?.ok && !signal.aborted) {
          setData((prev) => (prev ? { ...prev, ...full.data } : full.data));
        }
      })
      .catch(() => {});
  }, []);

  const refresh = useCallback(async ({ includeDrillDown = false } = {}) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Phase 1: slim fetch — fast, sets data immediately
      const res = await fetch('/api/production-metrics', { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'API error');
      setData(json.data);
      setError(null);

      // Phase 2: drill-down fetch in background (on mount or manual refresh)
      if (includeDrillDown && !controller.signal.aborted) {
        fetchDrillDown(controller.signal);
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fetchDrillDown]);

  // On mount: slim + drill-down
  useEffect(() => {
    refresh({ includeDrillDown: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling: slim only
  useVisibleInterval(refresh, POLL_MS);

  return {
    data,
    loading,
    error,
    refresh: () => refresh({ includeDrillDown: true }),
  };
}
