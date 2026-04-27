import { useState, useEffect, useCallback, useRef } from 'react';

const STALE_MAX_MS = 2 * 60 * 60 * 1000; // 2 hours

function lsKey(period, start, end) { return `sbg_src_${period}_${start || ''}_${end || ''}`; }
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
  try { localStorage.setItem(key, JSON.stringify({ d: data, t: Date.now() })); } catch {}
}

export function useSources(enabled = true) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('month');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const abortRef = useRef(null);

  const fetchSources = useCallback(async () => {
    if (!enabled) return;
    setError(null);

    const key = lsKey(period, customRange.start, customRange.end);
    const stale = lsRead(key);
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
      let url = `/api/sales-sources?period=${period}`;
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
      if (err.name === 'AbortError') return;
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, customRange.start, customRange.end, enabled]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  return { data, loading, refreshing, error, period, setPeriod, customRange, setCustomRange, lastRefreshed, refresh: fetchSources };
}
