import { useState, useEffect, useCallback, useRef } from 'react';
import useVisibleInterval from '../useVisibleInterval.js';
import { idbRead, idbWrite } from '../../lib/idbCache.js';

const REFRESH_INTERVAL = 15 * 60 * 1000;
const STALE_MAX_MS = 2 * 60 * 60 * 1000; // 2 hours

function cacheKey(period, start, end) {
  return `sbg_c_${period}_${start || ''}_${end || ''}`;
}

export function useCalls(enabled = true) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('today');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const intervalRef = useRef(null);
  const abortRef = useRef(null);

  const fetchCalls = useCallback(async () => {
    if (!enabled) return;

    // Cancel any previous in-flight fetch
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const key = cacheKey(period, customRange.start, customRange.end);
    const stale = await idbRead(key, STALE_MAX_MS);
    if (stale) {
      setData(stale);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const url = `/api/v2/sales-calls?period=${period}${
        period === 'custom' && customRange.start && customRange.end
          ? `&start=${customRange.start}&end=${customRange.end}`
          : ''
      }`;

      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();
      if (signal.aborted) return;
      await idbWrite(key, json);
      setData(json);
      setLastRefreshed(new Date());
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (!stale) setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, customRange.start, customRange.end, enabled]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  useVisibleInterval(fetchCalls, REFRESH_INTERVAL, enabled);

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
    refresh: fetchCalls,
  };
}
