import { useState, useEffect, useCallback, useRef } from 'react';
import useVisibleInterval from './useVisibleInterval.js';

const POLL_MS = 900_000; // 15 minutes

export function useMetaAdsData(preset = 'month') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const currentPreset = useRef(preset);
  currentPreset.current = preset;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/meta-ads-metrics?preset=${currentPreset.current}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'API error');
      setData(json.data);
      setLastRefreshed(new Date());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [preset, refresh]);

  useVisibleInterval(refresh, POLL_MS);

  return { data, loading, error, lastRefreshed, refresh };
}
