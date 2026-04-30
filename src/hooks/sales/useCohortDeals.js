import { useState, useEffect } from 'react';

const WIDE_PERIODS = new Set(['month', 'quarter', 'q1', 'q2', 'q3', 'q4', 'year']);

function needsCohortFetch(period, customRange) {
  if (WIDE_PERIODS.has(period)) return true;
  if (period === 'custom' && customRange?.start && customRange?.end) {
    return (new Date(customRange.end) - new Date(customRange.start)) / 86400000 > 14;
  }
  return false;
}

/**
 * Fetches contact-level cohort deal data for wide periods (> 2 weeks).
 * For narrow periods, metrics already includes cohortDeals — this hook returns null.
 *
 * Returns { data: Deal[] | null, loading: boolean, error: string | null }
 * Caller should use:  cohortDealsHook.data ?? metricsData.cohortDeals ?? []
 */
export function useCohortDeals(enabled, period, customRange) {
  const [state, setState] = useState({ data: null, loading: false, error: null });
  const shouldFetch = enabled && needsCohortFetch(period, customRange);

  useEffect(() => {
    if (!shouldFetch) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    setState((s) => ({ data: s.data, loading: true, error: null }));

    const params = new URLSearchParams({ period });
    if (period === 'custom' && customRange?.start) params.set('start', customRange.start);
    if (period === 'custom' && customRange?.end) params.set('end', customRange.end);

    const controller = new AbortController();
    fetch(`/api/sales-cohort-deals?${params}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`sales-cohort-deals API error: ${r.status}`);
        return r.json();
      })
      .then((json) => setState({ data: json.cohortDeals || [], loading: false, error: null }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState((s) => ({ data: s.data, loading: false, error: err.message }));
      });

    return () => controller.abort();
  }, [shouldFetch, period, customRange?.start, customRange?.end]);

  return state;
}
