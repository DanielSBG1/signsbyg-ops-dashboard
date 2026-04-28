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

  // Pre-warm localStorage for the current quarter only.
  // The server cron already keeps today/week/month/lastweek warm in KV — no
  // need to re-fetch those from the client and compete with the initial load.
  // Only the current quarter benefits from client-side priming (cron runs it
  // every 10 min, so there's a window where it's cold on first visit).
  useEffect(() => {
    if (!enabled || !data) return;
    const currentQuarter = `q${Math.floor(new Date().getMonth() / 3) + 1}`;
    const t = setTimeout(() => {
      fetch(`/api/sales-metrics?period=${currentQuarter}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => { if (json) lsWrite(lsKey(currentQuarter, '', ''), json); })
        .catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
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
