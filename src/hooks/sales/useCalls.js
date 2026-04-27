import { useState, useEffect, useCallback, useRef } from 'react';

const REFRESH_INTERVAL = 15 * 60 * 1000;
const STALE_MAX_MS = 2 * 60 * 60 * 1000; // 2 hours

function lsKey(period, start, end) {
  return `sbg_c_${period}_${start || ''}_${end || ''}`;
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

    const key = lsKey(period, customRange.start, customRange.end);
    const stale = lsRead(key);
    if (stale) {
      setData(stale);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const baseUrl = `/api/sales-calls?period=${period}${
        period === 'custom' && customRange.start && customRange.end
          ? `&start=${customRange.start}&end=${customRange.end}`
          : ''
      }`;

      const firstRes = await fetch(`${baseUrl}&page=0`, { signal });
      if (!firstRes.ok) throw new Error(`API error: ${firstRes.status}`);
      const first = await firstRes.json();
      if (signal.aborted) return;
      setData(first);

      const totalPages = first.pagination?.totalPages || 1;
      if (totalPages <= 1) {
        lsWrite(key, first);
        setLastRefreshed(new Date());
        return;
      }

      const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 1);
      const results = await Promise.allSettled(
        remainingPages.map((p) => fetch(`${baseUrl}&page=${p}`, { signal }).then((r) => r.json()))
      );

      if (signal.aborted) return;

      let allCalls = [...first.calls];
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.calls) {
          allCalls.push(...r.value.calls);
        }
      }
      const seen = new Set();
      allCalls = allCalls.filter((c) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });
      allCalls.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));

      const merged = {
        ...first,
        calls: allCalls,
        summary: {
          total: allCalls.length,
          inbound: allCalls.filter((c) => c.direction === 'incoming').length,
          outbound: allCalls.filter((c) => c.direction === 'outgoing').length,
          missed: allCalls.filter((c) => c.status === 'missed' || c.voicemail).length,
          answered: allCalls.filter((c) => c.duration > 0 && !c.voicemail).length,
          avgDuration: (() => {
            const withDur = allCalls.filter((c) => c.duration > 0);
            return withDur.length > 0
              ? Math.round(withDur.reduce((s, c) => s + c.duration, 0) / withDur.length)
              : 0;
          })(),
          byClassification: {
            new_prospect: allCalls.filter((c) => c.classification === 'new_prospect').length,
            existing_lead: allCalls.filter((c) => c.classification === 'existing_lead').length,
            existing_deal: allCalls.filter((c) => c.classification === 'existing_deal').length,
            existing_customer: allCalls.filter((c) => c.classification === 'existing_customer').length,
            unknown: allCalls.filter((c) => c.classification === 'unknown').length,
          },
        },
      };
      lsWrite(key, merged);
      setData(merged);
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

  useEffect(() => {
    if (!enabled) return;
    intervalRef.current = setInterval(fetchCalls, REFRESH_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [fetchCalls, enabled]);

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
