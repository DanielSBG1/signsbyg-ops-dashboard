import { useState, useEffect, useCallback, useRef } from 'react';
import { idbRead, idbWrite } from '../../lib/idbCache.js';

const STALE_MAX_MS = 2 * 60 * 60 * 1000; // 2 hours

function cacheKey(mode, period, start, end) { return `sbg_sc_${mode}_${period}_${start || ''}_${end || ''}`; }

export function useStageConversion(enabled = true) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('month');
  const [mode, setMode] = useState('cohort');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const abortRef = useRef(null);

  const fetchStageConversion = useCallback(async () => {
    if (!enabled) return;
    setError(null);

    const key = cacheKey(mode, period, customRange.start, customRange.end);
    const stale = await idbRead(key, STALE_MAX_MS);
    if (stale) {
      setData(stale);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let url = `/api/sales-stage-conversion?period=${period}&mode=${mode}`;
      if (period === 'custom' && customRange.start && customRange.end) {
        url += `&start=${customRange.start}&end=${customRange.end}`;
      }
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();
      await idbWrite(key, json);
      setData(json);
      setLastRefreshed(new Date());
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, mode, customRange.start, customRange.end, enabled]);

  useEffect(() => {
    fetchStageConversion();
  }, [fetchStageConversion]);

  return { data, loading, refreshing, error, period, setPeriod, mode, setMode, customRange, setCustomRange, lastRefreshed, refresh: fetchStageConversion };
}
