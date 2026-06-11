// src/hooks/usePeerReviews.js
import { useState, useCallback } from 'react';

export function usePeerReviews() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);
  const [submitted, setSubmitted]   = useState(false);

  const submitReview = useCallback(async ({ team, communication, accountability, attitude, processAdherence, reviewer }) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/excellence-peer-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team, communication, accountability, attitude, processAdherence, reviewer }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Submit failed');
      setSubmitted(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { submitting, error, submitted, submitReview, reset: () => { setSubmitted(false); setError(null); } };
}
