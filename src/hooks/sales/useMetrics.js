import { useState, useEffect, useCallback, useRef } from 'react';

const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes
const STALE_MAX_MS = 2 * 60 * 60 * 1000; // 2 hours — show stale rather than spinner

// --- localStorage helpers ---
function lsKey(period, start, end) {
  return `sbg_m2_${period}_${start || ''}_${end || ''}`;
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
  try {
    localStorage.setItem(key, JSON.stringify({ d: data, t: Date.now() }));
  } catch {}
}

export function useMetrics(enabled = true) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); // background revalidation
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('today');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const intervalRef = useRef(null);
  const abortRef = useRef(null); // abort controller for in-flight fetch

  const fetchMetrics = useCallback(async () => {
    if (!enabled) return;

    // Cancel any previous in-flight fetch so stale results don't overwrite fresh ones
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const key = lsKey(period, customRange.start, customRange.end);
    const stale = lsRead(key);
    if (stale) {
      // Show cached data immediately — no spinner, just spin the refresh icon
      setData(stale);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      let url = `/api/sales-metrics?period=${period}`;
      if (period === 'custom' && customRange.start && customRange.end) {
        url += `&start=${customRange.start}&end=${customRange.end}`;
      }
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();
      lsWrite(key, json);
      setData(json);
      setLastRefreshed(new Date());
    } catch (err) {
      if (err.name === 'AbortError') return; // period switched mid-flight, ignore
      if (!stale) setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, customRange.start, customRange.end, enabled]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useEffect(() => {
    if (!enabled) return;
    intervalRef.current = setInterval(fetchMetrics, REFRESH_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchMetrics, enabled]);

  // Pre-warm the server KV cache AND populate localStorage so that switching
  // to any period is instant — even on first visit.
  // Wave 1 (500ms): today/week/month — most-used
  // Wave 2 (3s): quarterly periods — warmed before the user clicks them
  useEffect(() => {
    if (!enabled || !data) return;
    // Pre-warm ALL periods on initial load only — don't re-fire on period
    // changes or it blasts 8+ concurrent cold Lambdas every click.
    const allPeriods = ['today', 'week', 'lastweek', 'month', 'quarter', 'q1', 'q2', 'q3', 'q4'];
    function warmPeriod(p) {
      fetch(`/api/sales-metrics?period=${p}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => { if (json) lsWrite(lsKey(p, '', ''), json); })
        .catch(() => {});
    }
    const t1 = setTimeout(() => { for (const p of allPeriods.slice(0, 4)) warmPeriod(p); }, 500);
    const t2 = setTimeout(() => { for (const p of allPeriods.slice(4)) warmPeriod(p); }, 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, data ? 'has-data' : 'no-data']);

  return {
    data,
    loading,
    refreshing,
    error,
    period,
    setPeriod,
    customRange,
    setCustomRange,
    lastRefreshed,
    refresh: fetchMetrics,
  };
}
