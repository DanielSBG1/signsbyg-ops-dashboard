import { useState, useEffect, useCallback, useRef } from 'react';

const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

// Closed periods have immutable data — cache them much longer in localStorage.
// Active periods (today, week, month, quarter) use 2h to stay reasonably fresh.
const STALE_MAX_BY_PERIOD = {
  lastweek:  24 * 60 * 60 * 1000,
  lastmonth: 24 * 60 * 60 * 1000,
  q1:        24 * 60 * 60 * 1000,
  q2:        24 * 60 * 60 * 1000,
  q3:        24 * 60 * 60 * 1000,
  q4:        24 * 60 * 60 * 1000,
};
const STALE_MAX_DEFAULT = 2 * 60 * 60 * 1000; // 2 hours for active periods

// --- localStorage helpers ---
function lsKey(period, start, end) {
  return `sbg_m2_${period}_${start || ''}_${end || ''}`;
}
function lsRead(key, period) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { d, t } = JSON.parse(raw);
    const maxAge = STALE_MAX_BY_PERIOD[period] ?? STALE_MAX_DEFAULT;
    if (Date.now() - t > maxAge) return null;
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

  const fetchMetrics = useCallback(async ({ force = false } = {}) => {
    if (!enabled) return;

    // Cancel any previous in-flight fetch so stale results don't overwrite fresh ones
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const key = lsKey(period, customRange.start, customRange.end);
    const stale = lsRead(key, period);
    if (stale && !force) {
      // Show cached data immediately — no spinner, just spin the refresh icon
      setData(stale);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(!stale); // show spinner only if we have nothing to show yet
      setRefreshing(!!stale);
    }
    setError(null);
    try {
      let url = `/api/sales-metrics?period=${period}`;
      if (period === 'custom' && customRange.start && customRange.end) {
        url += `&start=${customRange.start}&end=${customRange.end}`;
      }
      // Manual refresh: bust CDN cache with a timestamp so the edge re-validates,
      // but do NOT send nocache=1 — the server still uses KV (pre-warmed by cron)
      // so it returns in ~200ms instead of triggering a full 30–60s HubSpot recompute.
      if (force) url += `&_=${Date.now()}`;
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
  // Skips periods that already have a fresh localStorage entry (fresher than half the TTL).
  useEffect(() => {
    if (!enabled || !data) return;
    const allPeriods = ['today', 'week', 'lastweek', 'month', 'quarter', 'q1', 'q2', 'q3', 'q4'];
    function warmPeriod(p) {
      if (p === period) return; // already loaded
      const cachedKey = lsKey(p, '', '');
      const maxAge = STALE_MAX_BY_PERIOD[p] ?? STALE_MAX_DEFAULT;
      try {
        const raw = localStorage.getItem(cachedKey);
        if (raw) {
          const { t } = JSON.parse(raw);
          if (Date.now() - t < maxAge / 2) return; // still fresh enough — skip
        }
      } catch {}
      fetch(`/api/sales-metrics?period=${p}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => { if (json) lsWrite(cachedKey, json); })
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
    // Manual refresh busts CDN cache but still uses server KV — fast (~200ms).
    refresh: () => fetchMetrics({ force: true }),
  };
}
