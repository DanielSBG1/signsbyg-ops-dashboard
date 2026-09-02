import { useState, useEffect, useCallback, useRef } from 'react';
import useVisibleInterval from '../useVisibleInterval.js';
import { idbRead, idbWrite } from '../../lib/idbCache.js';

const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

const STALE_MAX_BY_PERIOD = {
  lastweek:  24 * 60 * 60 * 1000,
  lastmonth: 24 * 60 * 60 * 1000,
  q1:        24 * 60 * 60 * 1000,
  q2:        24 * 60 * 60 * 1000,
  q3:        24 * 60 * 60 * 1000,
  q4:        24 * 60 * 60 * 1000,
};
const STALE_MAX_DEFAULT = 2 * 60 * 60 * 1000;

function cacheKey(period, start, end) {
  return `sbg_m2_${period}_${start || ''}_${end || ''}`;
}

export function useMetrics(enabled = true) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('today');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const intervalRef = useRef(null);
  const abortRef = useRef(null);

  const fetchMetrics = useCallback(async ({ force = false } = {}) => {
    if (!enabled) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const key = cacheKey(period, customRange.start, customRange.end);
    const maxAge = STALE_MAX_BY_PERIOD[period] ?? STALE_MAX_DEFAULT;
    const stale = await idbRead(key, maxAge);
    if (stale && !force) {
      setData(stale);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(!stale);
      setRefreshing(!!stale);
    }
    setError(null);
    try {
      let baseUrl = `/api/v2/sales-metrics?period=${period}`;
      if (period === 'custom' && customRange.start && customRange.end) {
        baseUrl += `&start=${customRange.start}&end=${customRange.end}`;
      }
      let url = baseUrl;
      if (force) url += `&_=${Date.now()}`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();
      await idbWrite(key, json);
      setData(json);
      setLastRefreshed(new Date());

      if (!controller.signal.aborted) {
        let dealsUrl = `${baseUrl}&include=deals`;
        if (force) dealsUrl += `&_=${Date.now()}`;
        fetch(dealsUrl, { signal: controller.signal })
          .then((r) => r.ok ? r.json() : null)
          .then((full) => {
            if (full && !controller.signal.aborted) {
              setData((prev) => prev ? { ...prev, ...full } : full);
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (!stale) setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, customRange.start, customRange.end, enabled]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  useVisibleInterval(fetchMetrics, REFRESH_INTERVAL, enabled);

  useEffect(() => {
    if (!enabled || !data) return;
    const allPeriods = ['today', 'week', 'lastweek', 'month', 'quarter', 'q1', 'q2', 'q3', 'q4'];
    async function warmPeriod(p) {
      if (p === period) return;
      const wKey = cacheKey(p, '', '');
      const maxAge = STALE_MAX_BY_PERIOD[p] ?? STALE_MAX_DEFAULT;
      const cached = await idbRead(wKey, maxAge / 2);
      if (cached) return;
      fetch(`/api/v2/sales-metrics?period=${p}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => { if (json) idbWrite(wKey, json); })
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
    refresh: () => fetchMetrics({ force: true }),
  };
}
