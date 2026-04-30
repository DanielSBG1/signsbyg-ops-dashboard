import { useState, useEffect } from 'react';

const WIDE_PERIODS = new Set(['month', 'quarter', 'q1', 'q2', 'q3', 'q4', 'year']);

function isWidePeriod(period, customRange) {
  if (WIDE_PERIODS.has(period)) return true;
  if (period === 'custom' && customRange?.start && customRange?.end) {
    return (new Date(customRange.end) - new Date(customRange.start)) / 86400000 > 14;
  }
  return false;
}

/**
 * Fetches contacts for a single rep in the selected period.
 * Only fires for wide periods (month+) when a rep is selected and the
 * leaderboard is in leads-mode — narrow periods already have all contacts
 * from the main metrics payload.
 *
 * Returns { data: Lead[] | null, loading: boolean, error: string | null }
 */
export function useRepLeads(enabled, repId, period, customRange) {
  const [state, setState] = useState({ data: null, loading: false, error: null });

  const shouldFetch = enabled && !!repId && isWidePeriod(period, customRange);

  useEffect(() => {
    if (!shouldFetch) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    setState((s) => ({ data: s.data, loading: true, error: null }));

    const params = new URLSearchParams({ repId, period });
    if (period === 'custom' && customRange?.start) params.set('start', customRange.start);
    if (period === 'custom' && customRange?.end) params.set('end', customRange.end);

    const controller = new AbortController();
    fetch(`/api/sales-rep-leads?${params}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`sales-rep-leads API error: ${r.status}`);
        return r.json();
      })
      .then((json) => setState({ data: json.leads || [], loading: false, error: null }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState((s) => ({ data: s.data, loading: false, error: err.message }));
      });

    return () => controller.abort();
  }, [shouldFetch, repId, period, customRange?.start, customRange?.end]);

  return state;
}
